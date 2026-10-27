let onlineUser=null,uploadBusy=false,syncBusy=false,lastSynced='',videosAvailable=[];
const onlineBar=document.createElement('section');onlineBar.className='notice';onlineBar.style.margin='15px auto';onlineBar.style.maxWidth='1186px';onlineBar.id='onlineBar';document.querySelector('header').after(onlineBar);
const baseSave=save;save=function(){baseSave();queueSync()};
function mergeCloud(rows){const before=JSON.stringify(state);for(const r of rows||[]){if(r.read&&!state.read.includes(r.lesson))state.read.push(r.lesson);if(r.done&&!state.done.includes(r.lesson))state.done.push(r.lesson);if(r.score)state.scores[r.lesson]=1}if(JSON.stringify(state)!==before)baseSave()}
async function jsonApi(path,options){const res=await fetch('/api/'+path,options);let d;try{d=await res.json()}catch{throw Error('Máy chủ chưa trả về dữ liệu hợp lệ.')}if(!res.ok)throw Error(d.error||'Không thể kết nối');return d}
function post(path,data){return jsonApi(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})}
function statusBar(msg){onlineBar.replaceChildren();const text=document.createElement('span');text.textContent=msg+' ';onlineBar.append(text);if(onlineUser?.authenticated){const link=document.createElement('a');link.href='/signin-with-chatgpt?return_to=%2Fhome.html';link.target='_top';link.textContent='Đổi/đăng nhập lại tài khoản';onlineBar.append(link);if(onlineUser.admin||onlineUser.volunteer){const a=document.createElement('a');a.className='btn';a.style.marginLeft='15px';a.href='/admin.html';a.textContent=onlineUser.admin?'Mở dashboard':'Đánh giá học viên';onlineBar.append(a)}}else{const a=document.createElement('a');a.href='/signin-with-chatgpt?return_to=%2Fhome.html';a.target='_top';a.textContent='Đăng nhập để đồng bộ';onlineBar.append(a)}}
async function refreshOnline(){if(syncBusy)return;try{const d=await jsonApi('me');if(d.authenticated){if(onlineUser?.code!==d.code){progressStorageKey='sontra-user-'+d.code;try{state=JSON.parse(localStorage.getItem(progressStorageKey))||{read:[],done:[],scores:{}}}catch{state={read:[],done:[],scores:{}}}lastSynced='';baseSave()}onlineUser=d;mergeCloud(d.progress);statusBar('Mã học viên: '+d.code+' · Đang kết nối trực tuyến.');await queueSync()}else{if(onlineUser?.authenticated){progressStorageKey='sontra-progress';try{state=JSON.parse(localStorage.getItem(progressStorageKey))||{read:[],done:[],scores:{}}}catch{state={read:[],done:[],scores:{}}}baseSave()}onlineUser=d;statusBar('Bạn có thể học ngay. Tiến độ hiện chỉ lưu trên thiết bị.')}}catch{statusBar('Chưa kết nối được máy chủ. Tiến độ vẫn lưu trên thiết bị; sẽ thử lại.')}}
let syncTimer;function queueSync(){if(!onlineUser?.authenticated||syncBusy)return;clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,400)}
async function syncNow(){if(syncBusy||!onlineUser?.authenticated)return;const snapshot=JSON.stringify(state);if(snapshot===lastSynced)return;syncBusy=true;try{/* Mục 2, quyết định 3: không gửi scores. Điểm kiểm tra chỉ do máy chủ ghi sau khi chấm. */const {read,done}=JSON.parse(snapshot);await post('progress',{read,done,code:onlineUser.code});lastSynced=snapshot;statusBar('Mã học viên: '+onlineUser.code+' · Đã đồng bộ lúc '+new Date().toLocaleTimeString('vi-VN'));}catch(e){statusBar('Chưa đồng bộ: '+e.message+' Tiến độ đang giữ trên thiết bị.')}finally{syncBusy=false;if(JSON.stringify(state)!==snapshot)queueSync()}}
const baseLesson=lesson;lesson=function(i){baseLesson(i);const block=document.createElement('div');block.style.marginTop='20px';const h=document.createElement('h3');h.textContent='Video thao tác thực tế';block.append(h);// Bài dùng liên kết: chỉ nhúng khi URL đúng tiền tố youtube-nocookie (máy chủ đã kiểm tra; đây là lớp phòng thủ thứ hai).
// Bài tải tệp: phát qua /api/video/:lesson. Không gắn URL từ API vào innerHTML.
const info=videosAvailable.find(v=>v.lesson===i);const embedPrefix='https://www.youtube-nocookie.com/embed/';if(info?.kind==='link'){if(typeof info.url==='string'&&info.url.startsWith(embedPrefix)){const f=document.createElement('iframe');f.src=info.url;f.title='Video thực tế của bài '+(i+1);f.loading='lazy';f.referrerPolicy='strict-origin-when-cross-origin';f.allow='accelerometer; encrypted-media; gyroscope; picture-in-picture';f.allowFullscreen=true;f.style='width:100%;aspect-ratio:16/9;border:0';block.append(f)}else{const p=document.createElement('p');p.textContent='Liên kết video của bài này chưa hợp lệ. Vui lòng thông báo cho người hỗ trợ.';block.append(p)}}else if(info){const v=document.createElement('video');v.controls=true;v.playsInline=true;v.preload='metadata';v.src='/api/video/'+i;v.style='width:100%;max-height:400px';block.append(v)}else{const p=document.createElement('p');p.textContent='Bài này chưa có video thực tế. Bạn có thể đọc hoặc nghe hướng dẫn ở trên.';block.append(p)}block.append(completionControls(i));$('content').append(block)};
(async()=>{try{videosAvailable=await jsonApi('videos')}catch{}await refreshOnline();await refreshCourse();routeLesson()})();setInterval(refreshOnline,15000);window.addEventListener('online',()=>{refreshOnline().then(refreshCourse)});

// Commit 1.6 (FR-LRN, quy tắc 4.7): nút "Đánh dấu đã hoàn thành" nằm ngay dưới khung video.
// Chỉ là tự xác nhận của học viên, không phải kết quả đánh giá năng lực. Nút vẫn hoạt động khi chưa đăng nhập (lưu trên thiết bị).
function completionControls(i){
  const wrap=document.createElement('div');wrap.className='actions';wrap.style.marginTop='16px';wrap.style.flexWrap='wrap';
  const done=state.done.includes(i);
  const btn=document.createElement('button');btn.id='completeBtn';btn.style.minWidth='44px';btn.style.minHeight='44px';
  btn.textContent=done?'✓ Đã hoàn thành':'Đánh dấu đã hoàn thành';
  // Không cho bỏ đánh dấu: tiến độ hợp nhất theo giá trị lớn nhất (quy tắc 4.1).
  btn.disabled=done;
  btn.setAttribute('aria-describedby','completeNote');
  btn.onclick=()=>completeLesson(i);
  wrap.append(btn);
  const note=document.createElement('p');note.id='completeNote';note.className='small';
  note.textContent='Bạn tự xác nhận đã làm theo bài này. Đây không phải kết quả đánh giá năng lực của người hỗ trợ.';
  wrap.append(note);
  // Bài tiếp theo chỉ hiện sau khi hoàn thành, và chuyển khi người học bấm (không tự chuyển).
  if(done&&i<9){const next=document.createElement('button');next.className='secondary';next.style.minHeight='44px';next.textContent='Bài tiếp theo →';next.onclick=()=>lesson(i+1);wrap.append(next)}
  return wrap;
}
// Ghi nhận hoàn thành: cập nhật trên thiết bị ngay, rồi gửi lên máy chủ nếu đã đăng nhập.
// Lỗi mạng không làm mất tiến độ: state vẫn giữ trên thiết bị và queueSync sẽ thử lại.
async function completeLesson(i){
  if(!state.done.includes(i)){state.done.push(i);save()}
  if(!onlineUser?.authenticated){statusBar('Đã lưu trên thiết bị. Đăng nhập để đồng bộ nhiều thiết bị.');lesson(i);return}
  try{
    await post('progress/complete',{code:onlineUser.code,lesson:i});
    await refreshCourse();
    statusBar('Mã học viên: '+onlineUser.code+' · Đã ghi nhận hoàn thành bài '+(i+1)+'.');
  }catch(e){statusBar('Chưa đồng bộ hoàn thành: '+e.message+' Tiến độ đang giữ trên thiết bị.')}
  lesson(i);
}
// Tỷ lệ khóa học: lấy từ máy chủ khi đã đăng nhập để đồng bộ nhiều thiết bị; chưa đăng nhập thì app.js tự tính từ thiết bị.
async function refreshCourse(){
  if(!onlineUser?.authenticated){courseServer=null;render();return}
  try{const c=await jsonApi('progress/son-tra-so');courseServer={completed:c.completed_lessons,percent:c.percent}}catch{courseServer=null}
  render();
}
