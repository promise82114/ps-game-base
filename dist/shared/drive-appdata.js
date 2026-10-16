// Reusable Drive appDataFolder JSON storage; no knowledge of Checklist state.
(function(global){
 'use strict';
 class DriveError extends Error {constructor(message,code='drive'){super(message);this.code=code;}}
 class DriveAppData {
  constructor(auth,fileName){this.auth=auth;this.fileName=fileName;}
  async request(url,options={}){
   const token=this.auth.token(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
   try{
    const response=await fetch(url,{...options,cache:'no-store',signal:controller.signal,headers:{...options.headers,Authorization:'Bearer '+token}});
    if(response.status===401){this.auth.invalidate();throw new DriveError('Google 授權已失效，請重新授權。','expired');}
    if(response.status===412)throw new DriveError('雲端進度已變更，請重新下載比較後再操作。','conflict');
    if(!response.ok)throw new DriveError(response.status===403?'Drive 拒絕存取，請確認授權權限及 Drive API 設定。':response.status===429?'Drive 請求過於頻繁，請稍後重試。':`Drive 請求失敗（${response.status}），本機進度仍保留。`,response.status===403?'permission':'drive');
    // Read the body before clearing the timeout; stalled downloads also time out.
    return {text:await response.text(),etag:response.headers.get('ETag')};
   }catch(e){if(e.code)throw e;throw new DriveError(e.name==='AbortError'?'Drive 請求逾時，請重新下載確認雲端狀態。':'無法連接 Drive，請確認網路後重試。');}finally{clearTimeout(timer);}
  }
  json(result){try{return JSON.parse(result.text);}catch{throw new DriveError('雲端檔案不是有效的 JSON，本機進度未變更。','invalid');}}
  async find(){
   const files=[];let pageToken;
   do{
    const q="name = '"+this.fileName.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"' and trashed = false";
    const params=new URLSearchParams({spaces:'appDataFolder',q,fields:'nextPageToken,files(id,name,version,modifiedTime,size)',pageSize:'100'});
    if(pageToken)params.set('pageToken',pageToken);
    const data=this.json(await this.request('https://www.googleapis.com/drive/v3/files?'+params));
    if(!Array.isArray(data.files))throw new DriveError('Drive 回傳的檔案清單無效。');
    files.push(...data.files);pageToken=data.nextPageToken;
   }while(pageToken);
   if(files.length>1)throw new DriveError('雲端有多份同名進度，已停止操作以避免覆蓋。請先處理重複檔案。','duplicate');
   return files[0]||null;
  }
  async metadata(id){return this.json(await this.request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,name,version,modifiedTime,size'));}
  async read(){
   const file=await this.find();if(!file)return null;
   if(Number(file.size)>5*1024*1024)throw new DriveError('雲端進度超過 5 MB，已停止下載。','invalid');
   const media=await this.request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media');
   if(media.text.length>5*1024*1024)throw new DriveError('雲端进度檔案太大。','invalid');
   const latest=await this.metadata(file.id);
   if(latest.version!==file.version)throw new DriveError('下載期間雲端已變更，請再下載一次。','conflict');
   return {file:latest,etag:media.etag,value:this.json(media)};
  }
  async write(value,expected){
   const current=await this.find();
   if(expected?(!current||current.id!==expected.file.id||current.version!==expected.file.version):!!current)throw new DriveError('雲端進度已變更，請重新下載比較後再操作。','conflict');
   const body=JSON.stringify(value);
   if(current){
    if(!expected.etag)throw new DriveError('無法取得雲端版本保護資訊，已暫停同步以避免覆蓋。','invalid');
    await this.request('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(current.id)+'?uploadType=media',{method:'PATCH',headers:{'Content-Type':'application/json',...(expected.etag?{'If-Match':expected.etag}:{})},body});
   }else{
    const boundary='sideproject_'+crypto.randomUUID().replaceAll('-','');
    const metadata={name:this.fileName,mimeType:'application/json',parents:['appDataFolder']};
    const multipart=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body:multipart});
   }
  }
 }
 global.SideProjectDrive={DriveAppData,DriveError};
})(window);
