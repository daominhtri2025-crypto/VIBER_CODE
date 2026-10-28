import { env } from 'cloudflare:workers';
import { validateAssessment } from '../../../shared/assessment-rules';
import { loadLessonCatalog } from '../../../shared/lesson-service';
import { LESSON_GROUP_NAMES } from '../../../shared/lessons-seed';
import { checkVideoLink, checkVideoUpload, detectVideoFormat } from '../../../shared/video-rules';
import { COURSE_ID, buildCourseProgress, validateComplete, type CourseRow } from '../../../shared/progress-rules';
import { validateQuizAnswer } from '../../../shared/quiz-rules';
import { submitQuizAnswer } from '../../../shared/quiz-service';
import { filterFromSearchParams, loadDashboardSnapshot } from '../../../shared/dashboard-queries';
import { loadDashboardSummary } from '../../../shared/dashboard-summary';
import { applyStaffChange, validateStaffChange } from '../../../shared/staff-service';
import { completeLesson, loadCourseRows, loadLearnerProgress, syncProgress } from '../../../shared/progress-service';
import { recordAssessment } from '../../../shared/assessment-service';
export const dynamic='force-dynamic';

// Kiểu tối thiểu cho các phương thức route dùng (thay cho any). D1 và R2 đều có cùng dạng ở runtime.
interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface Db {
  prepare(query: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
}
interface StoredObject { body: ReadableStream | null; size: number; range?: { offset: number; length: number } }
interface Bucket {
  get(key: string, options: { range: Headers }): Promise<StoredObject | null>;
  put(key: string, value: ReadableStream, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}
interface Env { DB: Db; BUCKET: Bucket; OWNER_EMAIL?: string }
interface Identity { id: string | null; email: string; admin: boolean; volunteer: boolean }
interface ProgressBody { code: unknown; read: unknown; done: unknown }

const E = env as unknown as Env;
// Giới hạn kích thước thân yêu cầu tải video (gồm phần đệm multipart).
const UPLOAD_BODY_LIMIT = 27 * 1024 * 1024;

function out(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
async function role(req:Request):Promise<Identity>{const id=req.headers.get('oai-authenticated-user-id');const email=(req.headers.get('oai-authenticated-user-email')||'').toLowerCase();const admin=!!id&&!!E.OWNER_EMAIL&&email===E.OWNER_EMAIL.toLowerCase();const volunteer=!!id&&(admin||!!(await E.DB.prepare('SELECT email FROM staff WHERE email=?').bind(email).first()));return {id,email,admin,volunteer}}
async function me(id:string):Promise<{code:string}>{let learner=await E.DB.prepare('SELECT code FROM learners WHERE id=?').bind(id).first<{code:string}>();if(!learner){await E.DB.prepare('INSERT OR IGNORE INTO learners(id,code,created) VALUES(?,?,?)').bind(id,'ST-'+crypto.randomUUID().slice(0,12).toUpperCase(),new Date().toISOString()).run();learner=await E.DB.prepare('SELECT code FROM learners WHERE id=?').bind(id).first<{code:string}>()}if(!learner)throw new Error('learner missing');return learner}

export async function GET(req:Request){try{const u=new URL(req.url),p=u.pathname.replace('/api/','');
// FR-CNT: bài học chỉ đọc (quy tắc 4.4). Hàng hỏng hoặc thiếu bài trả 503, không trả dữ liệu dở dang.
if(p==='lessons'){const lessons=await loadLessonCatalog(E.DB);if(!lessons)return out({error:'Chưa tải được bài học. Vui lòng thử lại.'},503);return out({groups:LESSON_GROUP_NAMES,lessons})}
// Danh mục video công khai. Bài dùng liên kết có url (đã chuẩn hóa sang youtube-nocookie); bài tải tệp có url = null.
if(p==='videos'){return out((await E.DB.prepare('SELECT lesson,duration,updated,kind,url FROM videos ORDER BY lesson').all()).results)}
// FR-LRN-08: chỉ phát tệp tải lên (hỗ trợ Range). Bài dùng liên kết trả 404 để trình duyệt nhúng trực tiếp từ /api/videos.
if(/^video\/\d+$/.test(p)){const l=Number(p.split('/')[1]);const v=await E.DB.prepare('SELECT key,mime,kind FROM videos WHERE lesson=?').bind(l).first<{key:string;mime:string;kind:string}>();if(!v||v.kind!=='file')return out({error:'Chưa có video tải lên cho bài này'},404);const o=await E.BUCKET.get(v.key,{range:req.headers});if(!o)return out({error:'Không tìm thấy video'},404);const h=new Headers({'Content-Type':v.mime,'Accept-Ranges':'bytes','Cache-Control':'public,max-age=60','X-Content-Type-Options':'nosniff'});h.set('Content-Length',String(o.range?.length??o.size));if(o.range)h.set('Content-Range',`bytes ${o.range.offset}-${o.range.offset+o.range.length-1}/${o.size}`);return new Response(o.body,{headers:h,status:o.range?206:200})}
const r=await role(req);
// FR-LRN, Commit 1.6: tiến độ khóa học của chính học viên qua phiên xác thực; không nhận tham số học viên.
if(p==='progress/'+COURSE_ID){if(!r.id)return out({error:'Vui lòng đăng nhập'},401);return out(buildCourseProgress(await loadCourseRows(E.DB,r.id) as CourseRow[]))}
if(p.startsWith('progress/'))return out({error:'Không tìm thấy khóa học'},404);
if(p==='me'){if(!r.id)return out({authenticated:false});const l=await me(r.id);const rows=await loadLearnerProgress(E.DB,r.id);return out({authenticated:true,admin:r.admin,volunteer:r.volunteer,code:l.code,progress:rows})}
if(p==='dashboard'){if(!r.admin)return out({error:'Chỉ quản trị viên được xem dashboard'},403);
// FR-DSH-07: báo cáo lọc theo khoảng thời gian, bài, nhóm và kỳ. Bộ lọc sai trả 400 trước khi chạy truy vấn nào.
// Truy vấn và quy tắc nằm trong shared/dashboard-queries; route chỉ chuyển tham số.
let report;try{report=await loadDashboardSnapshot(E.DB,filterFromSearchParams(u.searchParams))}catch(e){if(e instanceof RangeError)return out({error:e.message},400);throw e}
const {learners,assessments,staff}=await loadDashboardSummary(E.DB);return out({learners,assessments,staff,at:new Date().toISOString(),report})}
return out({error:'Không tìm thấy'},404)}catch{return out({error:'Chưa thể tải dữ liệu. Vui lòng thử lại.'},503)}}

export async function POST(req:Request){try{if(req.headers.get('origin')!==new URL(req.url).origin)return out({error:'Yêu cầu không hợp lệ'},403);const r=await role(req);if(!r.id)return out({error:'Vui lòng đăng nhập'},401);const id=r.id;const p=new URL(req.url).pathname.replace('/api/','');
// Commit 1.6: ghi nhận hoàn thành bài. Idempotent: gọi lại không đổi completed_at hay updated.
if(p==='progress/complete'){const v=validateComplete(await req.json().catch(()=>null));if(!v.ok)return out({error:v.error},v.status);const learner=await me(id);if(v.value.code!==learner.code)return out({error:'Tài khoản đã thay đổi. Vui lòng làm mới trang.'},409);const completedAt=await completeLesson(E.DB,id,v.value.lesson,new Date().toISOString());return out({ok:true,lesson:v.value.lesson,completed_at:completedAt})}
// Mục 2, quyết định 3: điểm kiểm tra không nhận từ client. Trường scores của client cũ bị bỏ qua và không ghi vào progress.score.
if(p==='progress'){if(Number(req.headers.get('content-length')||0)>16000)return out({error:'Dữ liệu quá lớn'},413);const d=(await req.json()) as Partial<ProgressBody>|null;const valid=(a:unknown):a is number[]=>Array.isArray(a)&&a.length<=10&&a.every((v:unknown)=>Number.isInteger(v)&&(v as number)>=0&&(v as number)<10);if(!d||!valid(d.read)||!valid(d.done))return out({error:'Tiến độ không hợp lệ'},400);const learner=await me(id);if(d.code!==learner.code)return out({error:'Tài khoản đã thay đổi. Vui lòng làm mới trang.'},409);await syncProgress(E.DB,id,d.read as number[],d.done as number[],new Date().toISOString());return out({ok:true})}
// FR-OBS-04, quy tắc 4.3: phiếu idempotent theo (learner, client_id). Gửi lại cùng nội dung trả 200 với bản cũ;
// khác nội dung trả 409 để không ghi đè phiếu đã có.
if(p==='assessment'){if(!r.volunteer)return out({error:'Cần quyền người đánh giá'},403);const v=validateAssessment(await req.json().catch(()=>null));if(!v.ok)return out({error:v.error},400);const outcome=await recordAssessment(E.DB,v.value,r.email,{newId:crypto.randomUUID(),now:new Date().toISOString()});switch(outcome.kind){case 'unknown_learner':return out({error:'Không tìm thấy mã học viên. Học viên cần đăng nhập trước.'},404);case 'unavailable':return out({error:'Chưa lưu được dữ liệu. Vui lòng thử lại.'},503);case 'conflict':return out({error:'Mã phiếu này đã dùng cho nội dung khác. Vui lòng tải lại trang và nhập lại phiếu.'},409);case 'stored':return out({ok:true,created:true,id:outcome.id});case 'replayed':return out({ok:true,created:false,id:outcome.id})}}
if(p==='staff'){if(!r.admin)return out({error:'Không có quyền'},403);const change=validateStaffChange(await req.json().catch(()=>null));if(!change.ok)return out({error:change.error},400);await applyStaffChange(E.DB,change,new Date().toISOString());return out({ok:true})}
// FR-CNT-04, 06: tải tệp. Định dạng lấy từ chữ ký tệp, không tin Content-Type của client. Thay tệp cũ sau khi DB thành công.
if(p==='upload-video'){if(!r.admin)return out({error:'Không có quyền'},403);if(Number(req.headers.get('content-length')||0)>UPLOAD_BODY_LIMIT)return out({error:'Tệp tối đa 25 MB'},413);const form=await req.formData();const f=form.get('video');const lesson=Number(form.get('lesson')),duration=Number(form.get('duration'));if(!(f instanceof File))return out({error:'Chọn tệp MP4 hoặc WebM'},400);const pre=checkVideoUpload({lesson,duration,size:f.size});if(!pre.ok)return out({error:pre.error},pre.status);const mime=detectVideoFormat(new Uint8Array(await f.slice(0,64).arrayBuffer())); if(!mime)return out({error:'Tệp không phải MP4 hoặc WebM hợp lệ'},400);const previous=await E.DB.prepare('SELECT key,kind FROM videos WHERE lesson=?').bind(lesson).first<{key:string;kind:string}>();const key=`videos/${lesson}/${crypto.randomUUID()}`;await E.BUCKET.put(key,f.stream(),{httpMetadata:{contentType:mime}});try{await E.DB.prepare('INSERT INTO videos(lesson,key,mime,duration,updated,kind,url) VALUES(?,?,?,?,?,?,?) ON CONFLICT(lesson) DO UPDATE SET key=excluded.key,mime=excluded.mime,duration=excluded.duration,updated=excluded.updated,kind=excluded.kind,url=excluded.url').bind(lesson,key,mime,Math.ceil(duration),new Date().toISOString(),'file',null).run()}catch(error){await E.BUCKET.delete(key);throw error}if(previous?.kind==='file')await E.BUCKET.delete(previous.key);return out({ok:true})}
// FR-CNT-05, 06: dán liên kết YouTube. Lưu URL đã chuẩn hóa sang youtube-nocookie; thời lượng 0 nghĩa là không rõ.
if(p==='video-link'){if(!r.admin)return out({error:'Không có quyền'},403);const v=checkVideoLink(await req.json().catch(()=>null));if(!v.ok)return out({error:v.error},v.status);const previous=await E.DB.prepare('SELECT key,kind FROM videos WHERE lesson=?').bind(v.lesson).first<{key:string;kind:string}>();await E.DB.prepare("INSERT INTO videos(lesson,key,mime,duration,updated,kind,url) VALUES(?,'','',0,?,'link',?) ON CONFLICT(lesson) DO UPDATE SET key='',mime='',duration=0,updated=excluded.updated,kind='link',url=excluded.url").bind(v.lesson,new Date().toISOString(),v.embedUrl).run();if(previous?.kind==='file')await E.BUCKET.delete(previous.key);return out({ok:true})}
// Mục 2 (quyết định 1–5): máy chủ chấm bài kiểm tra. Đáp án đọc từ bảng lessons, không nhận từ client và không trả về.
// Idempotent theo (learner, client_id): gửi lại cùng lựa chọn trả kết quả cũ; khác lựa chọn trả 409.
if(p==='quiz/answer'){const v=validateQuizAnswer(await req.json().catch(()=>null));if(!v.ok)return out({error:v.error},v.status);const learner=await me(id);if(v.value.code!==learner.code)return out({error:'Tài khoản đã thay đổi. Vui lòng làm mới trang.'},409);const outcome=await submitQuizAnswer(E.DB,id,v.value,{newId:crypto.randomUUID(),now:new Date().toISOString()});switch(outcome.kind){case 'unknown_lesson':return out({error:'Không tìm thấy bài học'},404);case 'unreadable_quiz':return out({error:'Chưa chấm được bài này. Vui lòng thử lại.'},503);case 'invalid_choice':return out({error:'Lựa chọn không hợp lệ'},400);case 'unavailable':return out({error:'Chưa lưu được kết quả. Vui lòng thử lại.'},503);case 'conflict':return out({error:'Mã lượt làm này đã dùng cho lựa chọn khác. Vui lòng tải lại trang.'},409);case 'stored':return out({ok:true,correct:outcome.correct,attempt_count:outcome.attemptCount})}}
return out({error:'Không tìm thấy'},404)}catch{return out({error:'Chưa lưu được dữ liệu. Vui lòng thử lại.'},503)}}
