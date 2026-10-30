import { env } from 'cloudflare:workers';
import { validateAssessment } from '../../../shared/assessment-rules';
import { loadLessonCatalog } from '../../../shared/lesson-service';
import { findVideoByLesson, listVideos, replaceWithVideoLink, storeUploadedVideo } from '../../../shared/video-service';
import { ensureLearnerCode } from '../../../shared/identity-service';
import { login, logout, resolveSession, changePassword, updateProfile, createAccount, resetPassword, setAccountActive, listAccounts, type Session } from '../../../shared/auth-service';
import { LOCK_MINUTES, SESSION_COOKIE, SESSION_HOURS, validateChangePassword, validateCreateAccount, validateFullName, validateLogin, validateResetPassword, validateStatusChange } from '../../../shared/auth-rules';
import { readBodyWithLimit } from '../../../shared/body-limit';
import { LESSON_GROUP_NAMES } from '../../../shared/lessons-seed';
import { checkVideoLink } from '../../../shared/video-rules';
import { COURSE_ID, buildCourseProgress, validateComplete, type CourseRow } from '../../../shared/progress-rules';
import { validateQuizAnswer } from '../../../shared/quiz-rules';
import { submitQuizAnswer } from '../../../shared/quiz-service';
import { filterFromSearchParams, loadDashboardSnapshot } from '../../../shared/dashboard-queries';
import { loadDashboardSummary } from '../../../shared/dashboard-summary';
import { applyStaffChange, validateStaffChange } from '../../../shared/staff-service';
import { completeLesson, loadCourseRows, loadLearnerProgress, syncProgress } from '../../../shared/progress-service';
import { recordAssessment } from '../../../shared/assessment-service';
import { createNews, listAllNews, listPublicNews, updateNews } from '../../../shared/news-service';
import { validateNewsId, validateNewsInput } from '../../../shared/news-rules';
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
interface Env { DB: Db; BUCKET: Bucket; OWNER_EMAIL?: string; ADMIN_PASSWORD?: string }
interface Identity { id: string | null; email: string; admin: boolean; volunteer: boolean }
interface ProgressBody { code: unknown; read: unknown; done: unknown }

const E = env as unknown as Env;
// Giới hạn kích thước thân yêu cầu tải video (gồm phần đệm multipart).
const UPLOAD_BODY_LIMIT = 27 * 1024 * 1024;

function out(data:unknown,status=200,setCookie?:string){const headers:Record<string,string>={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};if(setCookie)headers['Set-Cookie']=setCookie;return Response.json(data,{status,headers})}
// Học viên vẫn dùng danh tính nền tảng qua header. Quản trị viên và tình nguyện viên chỉ có quyền qua phiên đăng nhập có cookie;
// header danh tính không còn cấp quyền quản trị hay đánh giá (CLAUDE.md mục 2).
function sessionToken(req:Request):string|null{for(const part of (req.headers.get('cookie')||'').split(';')){const [name,...value]=part.trim().split('=');if(name===SESSION_COOKIE)return value.join('=')||null}return null}
async function sessionOf(req:Request):Promise<Session|null>{return resolveSession(E.DB,sessionToken(req),new Date().toISOString())}
function roleOf(req:Request,s:Session|null):Identity{return {id:req.headers.get('oai-authenticated-user-id'),email:s?.assessorLabel??'',admin:s?.role==='admin',volunteer:!!s?.canAssess}}
function sessionCookie(token:string):string{return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS*3600}`}
const CLEAR_SESSION_COOKIE=`${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
// FR-AUTH: đăng nhập. Thông báo lỗi không tiết lộ email có tồn tại hay không và không chứa mật khẩu.
async function handleLogin(req:Request){const v=validateLogin(await req.json().catch(()=>null));if(!v.ok)return out({error:v.error},400);const res=await login(E.DB,v.value,{ownerEmail:E.OWNER_EMAIL,adminPassword:E.ADMIN_PASSWORD},new Date().toISOString());switch(res.kind){case 'ok':return out({ok:true,role:res.role,must_change:res.mustChange},200,sessionCookie(res.token));case 'invalid':return out({error:'Email hoặc mật khẩu không đúng'},401);case 'locked':return out({error:`Tài khoản tạm khóa do đăng nhập sai nhiều lần. Thử lại sau ${LOCK_MINUTES} phút.`},423);case 'disabled':return out({error:'Tài khoản đã bị vô hiệu hóa'},403);case 'unavailable':return out({error:'Chưa thể đăng nhập. Vui lòng thử lại.'},503)}}
async function handleLogout(req:Request){await logout(E.DB,sessionToken(req));return out({ok:true},200,CLEAR_SESSION_COOKIE)}
// Tài khoản: tự đổi mật khẩu và thông tin cá nhân (mọi vai trò có phiên); tạo, đặt lại, vô hiệu hóa chỉ quản trị viên.
async function handleAccountPost(p:string,req:Request,s:Session|null){const now=new Date().toISOString();
if(p==='auth/password'){if(!s)return out({error:'Vui lòng đăng nhập'},401);const v=validateChangePassword(await req.json().catch(()=>null));if(!v.ok)return out({error:v.error},400);const res=await changePassword(E.DB,s,sessionToken(req)??'',v.value,now);if(res==='wrong_current')return out({error:'Mật khẩu hiện tại không đúng'},400);if(res==='unavailable')return out({error:'Chưa thể đổi mật khẩu. Vui lòng thử lại.'},503);return out({ok:true})}
if(p==='auth/profile'){if(!s)return out({error:'Vui lòng đăng nhập'},401);const body=(await req.json().catch(()=>null)) as {full_name?:unknown}|null;const v=validateFullName(body?.full_name);if(!v.ok)return out({error:v.error},400);await updateProfile(E.DB,s.accountId,v.value,now);return out({ok:true})}
if(!s)return out({error:'Vui lòng đăng nhập'},401);
if(s.role!=='admin')return out({error:'Không có quyền'},403);
if(p==='accounts'){const v=validateCreateAccount(await req.json().catch(()=>null));if(!v.ok)return out({error:v.error},400);const res=await createAccount(E.DB,v.value,{ownerEmail:E.OWNER_EMAIL},crypto.randomUUID(),now);if(res==='exists')return out({error:'Email này đã có tài khoản'},409);if(res==='reserved')return out({error:'Email này không dùng cho tài khoản tình nguyện viên'},409);return out({ok:true},201)}
if(p==='accounts/reset'){const v=validateResetPassword(await req.json().catch(()=>null));if(!v.ok)return out({error:v.error},400);const res=await resetPassword(E.DB,v.value.id,v.value.password,now);return res==='ok'?out({ok:true}):out({error:'Không tìm thấy tài khoản'},404)}
if(p==='accounts/status'){const v=validateStatusChange(await req.json().catch(()=>null));if(!v.ok)return out({error:v.error},400);const res=await setAccountActive(E.DB,v.value.id,v.value.active,now);return res==='ok'?out({ok:true}):out({error:'Không tìm thấy tài khoản'},404)}
return out({error:'Không tìm thấy'},404)}
async function me(id:string):Promise<{code:string}>{return {code:await ensureLearnerCode(E.DB,id,()=>'ST-'+crypto.randomUUID().slice(0,12).toUpperCase(),new Date().toISOString())}}

export async function GET(req:Request){try{const u=new URL(req.url),p=u.pathname.replace('/api/','');
// FR-CNT: bài học chỉ đọc (quy tắc 4.4). Hàng hỏng hoặc thiếu bài trả 503, không trả dữ liệu dở dang.
if(p==='lessons'){const lessons=await loadLessonCatalog(E.DB);if(!lessons)return out({error:'Chưa tải được bài học. Vui lòng thử lại.'},503);return out({groups:LESSON_GROUP_NAMES,lessons})}
// Danh mục video công khai. Bài dùng liên kết có url (đã chuẩn hóa sang youtube-nocookie); bài tải tệp có url = null.
if(p==='videos'){return out(await listVideos(E.DB))}
// Tin tức trang chủ (phase 1): chỉ tin chưa ẩn, không cần đăng nhập. Tin ẩn không rời máy chủ qua đường này.
if(p==='news'){return out({news:await listPublicNews(E.DB)})}
// FR-LRN-08: chỉ phát tệp tải lên (hỗ trợ Range). Bài dùng liên kết trả 404 để trình duyệt nhúng trực tiếp từ /api/videos.
if(/^video\/\d+$/.test(p)){const l=Number(p.split('/')[1]);const v=await findVideoByLesson(E.DB,l);if(!v||v.kind!=='file')return out({error:'Chưa có video tải lên cho bài này'},404);const o=await E.BUCKET.get(v.key,{range:req.headers});if(!o)return out({error:'Không tìm thấy video'},404);const h=new Headers({'Content-Type':v.mime,'Accept-Ranges':'bytes','Cache-Control':'public,max-age=60','X-Content-Type-Options':'nosniff'});h.set('Content-Length',String(o.range?.length??o.size));if(o.range)h.set('Content-Range',`bytes ${o.range.offset}-${o.range.offset+o.range.length-1}/${o.size}`);return new Response(o.body,{headers:h,status:o.range?206:200})}
const s=await sessionOf(req);const r=roleOf(req,s);
// FR-LRN, Commit 1.6: tiến độ khóa học của chính học viên qua phiên xác thực; không nhận tham số học viên.
if(p==='progress/'+COURSE_ID){if(!r.id)return out({error:'Vui lòng đăng nhập'},401);return out(buildCourseProgress(await loadCourseRows(E.DB,r.id) as CourseRow[]))}
if(p.startsWith('progress/'))return out({error:'Không tìm thấy khóa học'},404);
// Trạng thái đăng nhập của cả ba vai trò. account chỉ có khi có phiên quản trị hoặc tình nguyện viên.
if(p==='me'){const account=s?{role:s.role,email:s.email,fullName:s.fullName,mustChange:s.mustChange}:null;if(!r.id)return out({authenticated:false,admin:r.admin,volunteer:r.volunteer,account});const l=await me(r.id);const rows=await loadLearnerProgress(E.DB,r.id);return out({authenticated:true,admin:r.admin,volunteer:r.volunteer,code:l.code,progress:rows,account})}
if(p==='accounts'){if(!r.admin)return out({error:'Không có quyền'},403);return out({accounts:await listAccounts(E.DB)})}
// Tin tức toàn bộ (kể cả tin ẩn) cho trang quản trị. Chỉ quản trị viên qua phiên đăng nhập.
if(p==='admin/news'){if(!s)return out({error:'Vui lòng đăng nhập'},401);if(s.role!=='admin')return out({error:'Không có quyền'},403);return out({news:await listAllNews(E.DB)})}
if(p==='dashboard'){if(!r.admin)return out({error:'Chỉ quản trị viên được xem dashboard'},403);
// FR-DSH-07: báo cáo lọc theo khoảng thời gian, bài, nhóm và kỳ. Bộ lọc sai trả 400 trước khi chạy truy vấn nào.
// Truy vấn và quy tắc nằm trong shared/dashboard-queries; route chỉ chuyển tham số.
let report;try{report=await loadDashboardSnapshot(E.DB,filterFromSearchParams(u.searchParams))}catch(e){if(e instanceof RangeError)return out({error:e.message},400);throw e}
const {learners,assessments,staff}=await loadDashboardSummary(E.DB);return out({learners,assessments,staff,at:new Date().toISOString(),report})}
return out({error:'Không tìm thấy'},404)}catch{return out({error:'Chưa thể tải dữ liệu. Vui lòng thử lại.'},503)}}

export async function POST(req:Request){try{if(req.headers.get('origin')!==new URL(req.url).origin)return out({error:'Yêu cầu không hợp lệ'},403);const p=new URL(req.url).pathname.replace('/api/','');
// Đăng nhập và đăng xuất không cần phiên trước; các route tài khoản tự kiểm tra phiên và vai trò.
if(p==='auth/login')return handleLogin(req);
if(p==='auth/logout')return handleLogout(req);
const s=await sessionOf(req);
if(p.startsWith('auth/')||p==='accounts'||p.startsWith('accounts/'))return handleAccountPost(p,req,s);
const r=roleOf(req,s);
// Tiến độ và quiz là dữ liệu của học viên (danh tính nền tảng). Quản trị và đánh giá không cần học viên đăng nhập.
const learnerRoute=p==='progress'||p==='progress/complete'||p==='quiz/answer';
if(!r.id&&!s)return out({error:'Vui lòng đăng nhập'},401);
if(learnerRoute&&!r.id)return out({error:'Vui lòng đăng nhập'},401);const id=r.id??'';
// Commit 1.6: ghi nhận hoàn thành bài. Idempotent: gọi lại không đổi completed_at hay updated.
if(p==='progress/complete'){const v=validateComplete(await req.json().catch(()=>null));if(!v.ok)return out({error:v.error},v.status);const learner=await me(id);if(v.value.code!==learner.code)return out({error:'Tài khoản đã thay đổi. Vui lòng làm mới trang.'},409);const completedAt=await completeLesson(E.DB,id,v.value.lesson,new Date().toISOString());return out({ok:true,lesson:v.value.lesson,completed_at:completedAt})}
// Mục 2, quyết định 3: điểm kiểm tra không nhận từ client. Trường scores của client cũ bị bỏ qua và không ghi vào progress.score.
if(p==='progress'){if(Number(req.headers.get('content-length')||0)>16000)return out({error:'Dữ liệu quá lớn'},413);const d=(await req.json()) as Partial<ProgressBody>|null;const valid=(a:unknown):a is number[]=>Array.isArray(a)&&a.length<=10&&a.every((v:unknown)=>Number.isInteger(v)&&(v as number)>=0&&(v as number)<10);if(!d||!valid(d.read)||!valid(d.done))return out({error:'Tiến độ không hợp lệ'},400);const learner=await me(id);if(d.code!==learner.code)return out({error:'Tài khoản đã thay đổi. Vui lòng làm mới trang.'},409);await syncProgress(E.DB,id,d.read as number[],d.done as number[],new Date().toISOString());return out({ok:true})}
// FR-OBS-04, quy tắc 4.3: phiếu idempotent theo (learner, client_id). Gửi lại cùng nội dung trả 200 với bản cũ;
// khác nội dung trả 409 để không ghi đè phiếu đã có.
if(p==='assessment'){if(!r.volunteer)return out({error:'Cần quyền người đánh giá'},403);const v=validateAssessment(await req.json().catch(()=>null));if(!v.ok)return out({error:v.error},400);const outcome=await recordAssessment(E.DB,v.value,r.email,{newId:crypto.randomUUID(),now:new Date().toISOString()});switch(outcome.kind){case 'unknown_learner':return out({error:'Không tìm thấy mã học viên. Học viên cần đăng nhập trước.'},404);case 'unavailable':return out({error:'Chưa lưu được dữ liệu. Vui lòng thử lại.'},503);case 'conflict':return out({error:'Mã phiếu này đã dùng cho nội dung khác. Vui lòng tải lại trang và nhập lại phiếu.'},409);case 'stored':return out({ok:true,created:true,id:outcome.id});case 'replayed':return out({ok:true,created:false,id:outcome.id})}}
// Tin tức (phase 1): chỉ quản trị viên đăng và sửa qua phiên đăng nhập; tình nguyện viên và học viên bị từ chối.
// Origin đã được kiểm tra ở đầu POST; dữ liệu được kiểm tra trong news-rules trước khi ghi.
if(p==='admin/news'){if(!s)return out({error:'Vui lòng đăng nhập'},401);if(s.role!=='admin')return out({error:'Không có quyền'},403);const v=validateNewsInput(await req.json().catch(()=>null));if(!v.ok)return out({error:v.error},400);const id=await createNews(E.DB,v.value,s.accountId,new Date().toISOString());return out({ok:true,id},201)}
if(p==='admin/news/update'){if(!s)return out({error:'Vui lòng đăng nhập'},401);if(s.role!=='admin')return out({error:'Không có quyền'},403);const body=(await req.json().catch(()=>null)) as {id?:unknown}|null;const idv=validateNewsId(body?.id);if(!idv.ok)return out({error:idv.error},400);const v=validateNewsInput(body);if(!v.ok)return out({error:v.error},400);const res=await updateNews(E.DB,idv.value,v.value,new Date().toISOString());return res==='ok'?out({ok:true}):out({error:'Không tìm thấy tin'},404)}
if(p==='staff'){if(!r.admin)return out({error:'Không có quyền'},403);const change=validateStaffChange(await req.json().catch(()=>null));if(!change.ok)return out({error:change.error},400);await applyStaffChange(E.DB,change,new Date().toISOString());return out({ok:true})}
// FR-CNT-04, 06: tải tệp. Định dạng lấy từ chữ ký tệp, không tin Content-Type của client. Thay tệp cũ sau khi DB thành công.
if(p==='upload-video'){if(!r.admin)return out({error:'Không có quyền'},403);const limited=await readBodyWithLimit(req,UPLOAD_BODY_LIMIT);if(!limited.ok)return out({error:'Tệp tối đa 25 MB'},413);const form=await new Response(limited.body,{headers:{'content-type':req.headers.get('content-type')||''}}).formData();const f=form.get('video');if(!(f instanceof File))return out({error:'Chọn tệp MP4 hoặc WebM'},400);const outcome=await storeUploadedVideo(E.DB,{put:async(key,body,contentType)=>{await E.BUCKET.put(key,body as ReadableStream,{httpMetadata:{contentType}})},delete:async(key)=>{await E.BUCKET.delete(key)}},{lesson:Number(form.get('lesson')),duration:Number(form.get('duration')),file:{size:f.size,head:async(length)=>new Uint8Array(await f.slice(0,length).arrayBuffer()),stream:()=>f.stream()}},{newId:crypto.randomUUID(),now:new Date().toISOString()});if(outcome.kind==='rejected')return out({error:outcome.error},outcome.status);return out({ok:true})}
// FR-CNT-05, 06: dán liên kết YouTube. Lưu URL đã chuẩn hóa sang youtube-nocookie; thời lượng 0 nghĩa là không rõ.
if(p==='video-link'){if(!r.admin)return out({error:'Không có quyền'},403);const v=checkVideoLink(await req.json().catch(()=>null));if(!v.ok)return out({error:v.error},v.status);const replaced=await replaceWithVideoLink(E.DB,v.lesson,v.embedUrl,new Date().toISOString());if(replaced.previousFileKey)await E.BUCKET.delete(replaced.previousFileKey);return out({ok:true})}
// Mục 2 (quyết định 1–5): máy chủ chấm bài kiểm tra. Đáp án đọc từ bảng lessons, không nhận từ client và không trả về.
// Idempotent theo (learner, client_id): gửi lại cùng lựa chọn trả kết quả cũ; khác lựa chọn trả 409.
if(p==='quiz/answer'){const v=validateQuizAnswer(await req.json().catch(()=>null));if(!v.ok)return out({error:v.error},v.status);const learner=await me(id);if(v.value.code!==learner.code)return out({error:'Tài khoản đã thay đổi. Vui lòng làm mới trang.'},409);const outcome=await submitQuizAnswer(E.DB,id,v.value,{newId:crypto.randomUUID(),now:new Date().toISOString()});switch(outcome.kind){case 'unknown_lesson':return out({error:'Không tìm thấy bài học'},404);case 'unreadable_quiz':return out({error:'Chưa chấm được bài này. Vui lòng thử lại.'},503);case 'invalid_choice':return out({error:'Lựa chọn không hợp lệ'},400);case 'unavailable':return out({error:'Chưa lưu được kết quả. Vui lòng thử lại.'},503);case 'conflict':return out({error:'Mã lượt làm này đã dùng cho lựa chọn khác. Vui lòng tải lại trang.'},409);case 'stored':return out({ok:true,correct:outcome.correct,attempt_count:outcome.attemptCount})}}
return out({error:'Không tìm thấy'},404)}catch{return out({error:'Chưa lưu được dữ liệu. Vui lòng thử lại.'},503)}}
