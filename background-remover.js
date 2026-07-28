(function(){
  "use strict";

  var byId=function(id){return document.getElementById(id)};
  var remover={
    file:null,image:null,sourceCanvas:null,sourceData:null,
    previewWidth:0,previewHeight:0,originalWidth:0,originalHeight:0,
    background:[255,255,255],baseMask:null,removed:0,
    actions:[],redo:[],tool:"pan",view:"result",backgroundView:"checker",
    zoom:1,panX:0,panY:0,fitScale:1,pointer:null,currentAction:null,
    picking:false,busy:false,renderTimer:null,artifacts:null,lastOutput:null
  };

  var ui={
    input:byId("brFileInput"),pick:byId("brPickFile"),drop:byId("brDropzone"),
    bgColor:byId("brBackgroundColor"),colorLabel:byId("brColorLabel"),
    autoBg:byId("brAutoBackground"),pipette:byId("brPipette"),analyze:byId("brAnalyze"),
    tolerance:byId("brTolerance"),toleranceValue:byId("brToleranceValue"),
    smooth:byId("brSmooth"),smoothValue:byId("brSmoothValue"),
    halo:byId("brHalo"),haloValue:byId("brHaloValue"),
    edge:byId("brEdge"),edgeValue:byId("brEdgeValue"),
    brush:byId("brBrush"),brushValue:byId("brBrushValue"),
    undo:byId("brUndo"),redo:byId("brRedo"),reset:byId("brReset"),
    canvas:byId("brCanvas"),shell:byId("brCanvasShell"),empty:byId("brPreviewEmpty"),
    cursor:byId("brBrushCursor"),meta:byId("brImageMeta"),resultInfo:byId("brResultInfo"),
    backgroundInfo:byId("brBackgroundInfo"),qualityInfo:byId("brQualityInfo"),
    zoomOut:byId("brZoomOut"),zoomIn:byId("brZoomIn"),zoomValue:byId("brZoomValue"),fit:byId("brFit"),
    download:byId("brDownload"),addOrder:byId("brAddToOrder"),
    progress:byId("brProgress"),message:byId("brMessage")
  };
  if(!ui.input||!ui.canvas||!ui.shell)return;

  function setMessage(text,type){
    ui.message.textContent=text||"";
    ui.message.className="br-message"+(type?" "+type:"")
  }

  function openRemover(){
    document.querySelectorAll(".tabs button").forEach(function(button){
      button.classList.toggle("active",button.dataset.view==="background-remover")
    });
    document.querySelectorAll(".app-page").forEach(function(page){
      page.classList.toggle("hidden",page.id!=="bgRemoverView")
    });
    window.scrollTo({top:0,behavior:"smooth"});
    setTimeout(updateCanvasSize,80)
  }

  document.querySelectorAll(".js-bg-nav").forEach(function(button){button.onclick=openRemover});

  function hexToRgb(hex){
    var clean=String(hex||"#ffffff").replace("#","");
    return[parseInt(clean.slice(0,2),16)||0,parseInt(clean.slice(2,4),16)||0,parseInt(clean.slice(4,6),16)||0]
  }
  function rgbToHex(rgb){
    return"#"+rgb.map(function(value){return Math.max(0,Math.min(255,Math.round(value))).toString(16).padStart(2,"0")}).join("")
  }
  function updateLabels(){
    ui.toleranceValue.textContent=ui.tolerance.value+" %";
    ui.smoothValue.textContent=ui.smooth.value+" px";
    ui.haloValue.textContent=ui.halo.value+" %";
    ui.edgeValue.textContent=(Number(ui.edge.value)>0?"+":"")+ui.edge.value+" px";
    ui.brushValue.textContent=ui.brush.value+" px";
    ui.colorLabel.textContent=ui.bgColor.value.toUpperCase()
  }
  function updateButtons(){
    var ready=!!remover.image&&!remover.busy;
    ui.analyze.disabled=!ready;ui.download.disabled=!ready;ui.addOrder.disabled=!ready;ui.reset.disabled=!ready;
    ui.undo.disabled=!remover.actions.length||remover.busy;
    ui.redo.disabled=!remover.redo.length||remover.busy
  }
  function setBusy(value){
    remover.busy=value;
    ui.progress.classList.toggle("hidden",!value);
    updateButtons()
  }

  function inferBackground(data,width,height){
    var bins=new Map(),step=Math.max(1,Math.floor(Math.max(width,height)/500));
    function add(x,y){
      var index=(y*width+x)*4;
      if(data[index+3]<20)return;
      var key=(data[index]>>4)+","+(data[index+1]>>4)+","+(data[index+2]>>4);
      var item=bins.get(key)||{count:0,r:0,g:0,b:0};
      item.count++;item.r+=data[index];item.g+=data[index+1];item.b+=data[index+2];bins.set(key,item)
    }
    for(var x=0;x<width;x+=step){add(x,0);add(x,height-1)}
    for(var y=0;y<height;y+=step){add(0,y);add(width-1,y)}
    var best=null;
    bins.forEach(function(item){if(!best||item.count>best.count)best=item});
    return best?[best.r/best.count,best.g/best.count,best.b/best.count]:[255,255,255]
  }

  function colorMatches(data,pixel,bg,limitSq){
    var offset=pixel*4;
    if(data[offset+3]<18)return true;
    var dr=data[offset]-bg[0],dg=data[offset+1]-bg[1],db=data[offset+2]-bg[2];
    return dr*dr*.30+dg*dg*.59+db*db*.11<=limitSq
  }

  function buildBaseMask(imageData,width,height,bg,tolerance){
    var data=imageData.data,n=width*height,mask=new Uint8ClampedArray(n),removed=0;
    mask.fill(255);
    var limit=7+Number(tolerance)*2.2,limitSq=limit*limit;
    function matches(index){return colorMatches(data,index,bg,limitSq)}
    function flood(seed){
      if(mask[seed]===0||!matches(seed))return;
      var stack=[seed];
      while(stack.length){
        var index=stack.pop();
        if(mask[index]===0||!matches(index))continue;
        var y=Math.floor(index/width),x=index-y*width,row=y*width,left=x,right=x;
        while(left>0&&mask[row+left-1]!==0&&matches(row+left-1))left--;
        while(right<width-1&&mask[row+right+1]!==0&&matches(row+right+1))right++;
        for(var fillX=left;fillX<=right;fillX++){
          var fillIndex=row+fillX;
          if(mask[fillIndex]!==0){mask[fillIndex]=0;removed++}
        }
        for(var direction=-1;direction<=1;direction+=2){
          var nextY=y+direction;
          if(nextY<0||nextY>=height)continue;
          var nextRow=nextY*width,scan=left;
          while(scan<=right){
            while(scan<=right&&(mask[nextRow+scan]===0||!matches(nextRow+scan)))scan++;
            if(scan<=right){
              stack.push(nextRow+scan);scan++;
              while(scan<=right&&mask[nextRow+scan]!==0&&matches(nextRow+scan))scan++
            }
          }
        }
      }
    }
    for(var x=0;x<width;x++){flood(x);flood((height-1)*width+x)}
    for(var y=0;y<height;y++){flood(y*width);flood(y*width+width-1)}
    return{mask:mask,removed:removed}
  }

  function shiftMask(mask,width,height,amount){
    var result=mask,rounds=Math.abs(Math.round(amount)),removeMore=amount>0;
    for(var round=0;round<rounds;round++){
      var next=new Uint8ClampedArray(result);
      for(var y=1;y<height-1;y++){
        var row=y*width;
        for(var x=1;x<width-1;x++){
          var index=row+x,value=result[index];
          if(removeMore&&value>0){
            if(result[index-1]===0||result[index+1]===0||result[index-width]===0||result[index+width]===0)next[index]=0
          }else if(!removeMore&&value<255){
            if(result[index-1]===255||result[index+1]===255||result[index-width]===255||result[index+width]===255)next[index]=255
          }
        }
      }
      result=next
    }
    return result
  }

  function smoothMask(mask,width,height,amount){
    if(amount<=0)return mask;
    var result=new Uint8ClampedArray(mask),passes=Math.max(1,Math.ceil(amount/3)),blend=Math.min(.9,.3+amount*.075);
    for(var pass=0;pass<passes;pass++){
      var next=new Uint8ClampedArray(result);
      for(var y=1;y<height-1;y++){
        var row=y*width;
        for(var x=1;x<width-1;x++){
          var index=row+x,current=result[index];
          var min=Math.min(current,result[index-1],result[index+1],result[index-width],result[index+width]);
          var max=Math.max(current,result[index-1],result[index+1],result[index-width],result[index+width]);
          if(min===max)continue;
          var average=(current*4+result[index-1]+result[index+1]+result[index-width]+result[index+width])/8;
          next[index]=Math.round(current*(1-blend)+average*blend)
        }
      }
      result=next
    }
    return result
  }

  function processedMask(base,width,height,scale){
    var edge=Math.round(Number(ui.edge.value)*scale);
    var smooth=Math.max(0,Math.round(Number(ui.smooth.value)*Math.min(scale,3)));
    var mask=new Uint8ClampedArray(base);
    if(edge)mask=shiftMask(mask,width,height,edge);
    if(smooth)mask=smoothMask(mask,width,height,smooth);
    return mask
  }

  function paintAction(ctx,action,scale){
    var points=action.points;
    if(!points.length)return;
    ctx.save();
    if(action.tool==="erase")ctx.globalCompositeOperation="destination-out";
    else{ctx.globalCompositeOperation="source-over";ctx.strokeStyle="#fff";ctx.fillStyle="#fff"}
    ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=action.radius*2*scale;
    if(points.length===1){
      ctx.beginPath();ctx.arc(points[0].x*scale,points[0].y*scale,action.radius*scale,0,Math.PI*2);ctx.fill()
    }else{
      ctx.beginPath();ctx.moveTo(points[0].x*scale,points[0].y*scale);
      for(var i=1;i<points.length;i++)ctx.lineTo(points[i].x*scale,points[i].y*scale);
      ctx.stroke()
    }
    ctx.restore()
  }

  function createMaskCanvas(mask,width,height,scale){
    var canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
    canvas.width=width;canvas.height=height;
    var image=ctx.createImageData(width,height),data=image.data;
    for(var i=0;i<mask.length;i++){
      var offset=i*4;data[offset]=255;data[offset+1]=255;data[offset+2]=255;data[offset+3]=mask[i]
    }
    ctx.putImageData(image,0,0);
    remover.actions.forEach(function(action){paintAction(ctx,action,scale)});
    if(remover.currentAction)paintAction(ctx,remover.currentAction,scale);
    return canvas
  }

  function createArtifacts(sourceCanvas,base,width,height,scale){
    var mask=processedMask(base,width,height,scale),maskCanvas=createMaskCanvas(mask,width,height,scale);
    var source=document.createElement("canvas"),sourceCtx=source.getContext("2d",{willReadFrequently:true});
    source.width=width;source.height=height;sourceCtx.drawImage(sourceCanvas,0,0,width,height);
    var halo=Number(ui.halo.value)/100;
    if(halo>0){
      var sourcePixels=sourceCtx.getImageData(0,0,width,height);
      var maskPixels=maskCanvas.getContext("2d",{willReadFrequently:true}).getImageData(0,0,width,height).data;
      var pixels=sourcePixels.data,bg=hexToRgb(ui.bgColor.value);
      for(var i=0;i<width*height;i++){
        var alpha=maskPixels[i*4+3]/255;
        if(alpha<=0||alpha>=.995)continue;
        var contamination=(1-alpha)*halo*.88,denominator=Math.max(.12,1-contamination),offset=i*4;
        pixels[offset]=Math.max(0,Math.min(255,(pixels[offset]-bg[0]*contamination)/denominator));
        pixels[offset+1]=Math.max(0,Math.min(255,(pixels[offset+1]-bg[1]*contamination)/denominator));
        pixels[offset+2]=Math.max(0,Math.min(255,(pixels[offset+2]-bg[2]*contamination)/denominator))
      }
      sourceCtx.putImageData(sourcePixels,0,0)
    }
    var result=document.createElement("canvas"),resultCtx=result.getContext("2d");
    result.width=width;result.height=height;resultCtx.drawImage(source,0,0);
    resultCtx.globalCompositeOperation="destination-in";resultCtx.drawImage(maskCanvas,0,0);
    resultCtx.globalCompositeOperation="source-over";
    return{result:result,mask:maskCanvas}
  }

  function drawDisplay(){
    if(!remover.sourceCanvas||!remover.artifacts)return;
    var width=remover.previewWidth,height=remover.previewHeight,ctx=ui.canvas.getContext("2d");
    ui.canvas.width=width;ui.canvas.height=height;ctx.clearRect(0,0,width,height);
    if(remover.view==="original")ctx.drawImage(remover.sourceCanvas,0,0);
    else if(remover.view==="mask"){
      ctx.fillStyle="#111318";ctx.fillRect(0,0,width,height);ctx.drawImage(remover.artifacts.mask,0,0)
    }else if(remover.view==="split"){
      ctx.save();ctx.beginPath();ctx.rect(0,0,width/2,height);ctx.clip();ctx.drawImage(remover.sourceCanvas,0,0);ctx.restore();
      ctx.save();ctx.beginPath();ctx.rect(width/2,0,width/2,height);ctx.clip();ctx.drawImage(remover.artifacts.result,0,0);ctx.restore();
      ctx.fillStyle="rgba(255,255,255,.95)";ctx.fillRect(width/2-1,0,2,height);
      ctx.fillStyle="#111318";ctx.font=Math.max(10,Math.round(width/55))+"px system-ui";ctx.fillText("AVANT",12,24);ctx.fillText("APRÈS",width/2+12,24)
    }else ctx.drawImage(remover.artifacts.result,0,0);
    updateCanvasSize()
  }

  function renderPreview(){
    if(!remover.sourceCanvas||!remover.baseMask)return;
    try{
      remover.artifacts=createArtifacts(remover.sourceCanvas,remover.baseMask,remover.previewWidth,remover.previewHeight,1);
      drawDisplay();
      var maskData=remover.artifacts.mask.getContext("2d",{willReadFrequently:true}).getImageData(0,0,remover.previewWidth,remover.previewHeight).data;
      var removed=0,total=remover.previewWidth*remover.previewHeight;
      for(var i=0;i<total;i++)if(maskData[i*4+3]<128)removed++;
      var percent=removed/total*100;
      ui.backgroundInfo.innerHTML='<svg class="icon"><use href="#i-check"/></svg><div><strong>'+percent.toLocaleString("fr-DZ",{maximumFractionDigits:1})+' % du fond retiré</strong><span>Seules les zones extérieures connectées ont été supprimées. Corrigez si nécessaire avec les pinceaux.</span></div>';
      ui.resultInfo.textContent="Aperçu actualisé • original préservé";
      setMessage("Fond supprimé. Vérifiez le résultat sur les différents supports.","success")
    }catch(error){setMessage("Aperçu impossible : "+error.message,"error")}
  }

  function scheduleRender(delay){
    clearTimeout(remover.renderTimer);
    ui.resultInfo.textContent="Mise à jour de l’aperçu…";
    remover.renderTimer=setTimeout(renderPreview,typeof delay==="number"?delay:80)
  }

  function analyze(){
    if(!remover.sourceData)return;
    updateLabels();
    ui.resultInfo.textContent="Analyse du fond extérieur…";
    setMessage("Analyse intelligente en cours…");
    setTimeout(function(){
      try{
        remover.background=hexToRgb(ui.bgColor.value);
        var result=buildBaseMask(remover.sourceData,remover.previewWidth,remover.previewHeight,remover.background,Number(ui.tolerance.value));
        remover.baseMask=result.mask;remover.removed=result.removed;
        updateButtons();renderPreview()
      }catch(error){setMessage("Analyse impossible : "+error.message,"error")}
    },20)
  }

  function decodeImage(file){
    if(window.createImageBitmap)return createImageBitmap(file,{imageOrientation:"from-image"});
    return new Promise(function(resolve,reject){
      var image=new Image(),url=URL.createObjectURL(file);
      image.onload=function(){URL.revokeObjectURL(url);resolve(image)};
      image.onerror=function(){URL.revokeObjectURL(url);reject(new Error("Image illisible."))};
      image.src=url
    })
  }

  function formatBytes(bytes){
    if(bytes<1024)return bytes+" o";
    if(bytes<1048576)return(bytes/1024).toFixed(1)+" Kio";
    return(bytes/1048576).toFixed(1)+" Mio"
  }

  async function loadFile(file){
    if(!file||!/^image\/(png|jpeg|webp)$/i.test(file.type))throw new Error("Choisissez une image PNG, JPG ou WebP.");
    if(file.size>60*1024*1024)throw new Error("L’image dépasse la limite de 60 Mo.");
    setMessage("Lecture et analyse de l’image…");
    var image=await decodeImage(file),width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
    if(!width||!height)throw new Error("Dimensions de l’image introuvables.");
    if(width*height>40000000)throw new Error("Cette image dépasse 40 mégapixels. Réduisez légèrement ses dimensions puis réessayez.");
    remover.file=file;remover.image=image;remover.originalWidth=width;remover.originalHeight=height;
    var scale=Math.min(1,1800/Math.max(width,height),Math.sqrt(2600000/(width*height)));
    var previewWidth=Math.max(1,Math.round(width*scale)),previewHeight=Math.max(1,Math.round(height*scale));
    var source=document.createElement("canvas"),ctx=source.getContext("2d",{willReadFrequently:true});
    source.width=previewWidth;source.height=previewHeight;ctx.drawImage(image,0,0,previewWidth,previewHeight);
    remover.sourceCanvas=source;remover.sourceData=ctx.getImageData(0,0,previewWidth,previewHeight);
    remover.previewWidth=previewWidth;remover.previewHeight=previewHeight;
    remover.background=inferBackground(remover.sourceData.data,previewWidth,previewHeight);
    ui.bgColor.value=rgbToHex(remover.background);updateLabels();
    remover.actions=[];remover.redo=[];remover.zoom=1;remover.panX=0;remover.panY=0;
    ui.empty.classList.add("hidden");
    ui.meta.textContent=width.toLocaleString("fr-DZ")+" × "+height.toLocaleString("fr-DZ")+" px • "+formatBytes(file.size);
    var widthCm=width/300*2.54,heightCm=height/300*2.54;
    ui.qualityInfo.innerHTML='<svg class="icon"><use href="#i-meter"/></svg><div><strong>Export pleine résolution • 300 DPI</strong><span>Dimension à 300 DPI : '+widthCm.toLocaleString("fr-DZ",{maximumFractionDigits:1})+' × '+heightCm.toLocaleString("fr-DZ",{maximumFractionDigits:1})+' cm.</span></div>';
    updateButtons();analyze()
  }

  function updateCanvasSize(){
    if(!remover.previewWidth||!remover.previewHeight)return;
    var width=Math.max(220,ui.shell.clientWidth-28),height=Math.max(260,ui.shell.clientHeight-28);
    remover.fitScale=Math.min(width/remover.previewWidth,height/remover.previewHeight);
    var displayScale=remover.fitScale*remover.zoom;
    ui.canvas.style.width=Math.max(1,remover.previewWidth*displayScale)+"px";
    ui.canvas.style.height=Math.max(1,remover.previewHeight*displayScale)+"px";
    ui.canvas.style.transform="translate("+remover.panX+"px,"+remover.panY+"px)";
    ui.zoomValue.textContent=Math.round(remover.zoom*100)+" %"
  }

  function setZoom(value){
    remover.zoom=Math.max(.25,Math.min(6,value));
    if(remover.zoom===1){remover.panX=0;remover.panY=0}
    updateCanvasSize()
  }

  function setTool(tool){
    remover.tool=tool;remover.picking=false;
    ui.shell.dataset.tool=tool;
    document.querySelectorAll("[data-br-tool]").forEach(function(button){
      var active=button.dataset.brTool===tool;button.classList.toggle("active",active);button.setAttribute("aria-pressed",active?"true":"false")
    });
    ui.cursor.classList.add("hidden")
  }

  function canvasPoint(event){
    var rect=ui.canvas.getBoundingClientRect();
    return{x:(event.clientX-rect.left)*ui.canvas.width/rect.width,y:(event.clientY-rect.top)*ui.canvas.height/rect.height}
  }

  function moveCursor(event){
    if(remover.tool==="pan"||!remover.image){ui.cursor.classList.add("hidden");return}
    var shellRect=ui.shell.getBoundingClientRect(),canvasRect=ui.canvas.getBoundingClientRect();
    var diameter=Number(ui.brush.value)*2*(canvasRect.width/ui.canvas.width);
    ui.cursor.style.width=diameter+"px";ui.cursor.style.height=diameter+"px";
    ui.cursor.style.left=(event.clientX-shellRect.left)+"px";ui.cursor.style.top=(event.clientY-shellRect.top)+"px";
    ui.cursor.classList.remove("hidden")
  }

  function sampleColor(event){
    var point=canvasPoint(event);
    var x=Math.max(0,Math.min(remover.previewWidth-1,Math.round(point.x)));
    var y=Math.max(0,Math.min(remover.previewHeight-1,Math.round(point.y)));
    var offset=(y*remover.previewWidth+x)*4,data=remover.sourceData.data;
    remover.background=[data[offset],data[offset+1],data[offset+2]];
    ui.bgColor.value=rgbToHex(remover.background);updateLabels();remover.picking=false;setTool("pan");
    setMessage("Couleur du fond choisie avec la pipette.","success");analyze()
  }

  ui.canvas.addEventListener("pointerdown",function(event){
    if(!remover.image)return;
    event.preventDefault();ui.canvas.setPointerCapture(event.pointerId);
    if(remover.picking){sampleColor(event);return}
    if(remover.tool==="pan"||event.button===1){
      remover.pointer={mode:"pan",x:event.clientX,y:event.clientY,startX:remover.panX,startY:remover.panY};
      ui.shell.classList.add("panning");return
    }
    var point=canvasPoint(event);
    remover.currentAction={tool:remover.tool,radius:Number(ui.brush.value),points:[point]};
    remover.pointer={mode:"paint",last:point};scheduleRender(25)
  });
  ui.canvas.addEventListener("pointermove",function(event){
    moveCursor(event);
    if(!remover.pointer)return;
    event.preventDefault();
    if(remover.pointer.mode==="pan"){
      remover.panX=remover.pointer.startX+event.clientX-remover.pointer.x;
      remover.panY=remover.pointer.startY+event.clientY-remover.pointer.y;updateCanvasSize();return
    }
    var point=canvasPoint(event),last=remover.pointer.last,dx=point.x-last.x,dy=point.y-last.y;
    if(Math.sqrt(dx*dx+dy*dy)>=Math.max(1,Number(ui.brush.value)*.12)){
      remover.currentAction.points.push(point);remover.pointer.last=point;scheduleRender(30)
    }
  });
  function finishPointer(){
    if(!remover.pointer)return;
    if(remover.pointer.mode==="paint"&&remover.currentAction){
      remover.actions.push(remover.currentAction);remover.redo=[];remover.currentAction=null;updateButtons();scheduleRender(10)
    }
    remover.pointer=null;ui.shell.classList.remove("panning")
  }
  ui.canvas.addEventListener("pointerup",finishPointer);
  ui.canvas.addEventListener("pointercancel",finishPointer);
  ui.canvas.addEventListener("pointerleave",function(){if(!remover.pointer)ui.cursor.classList.add("hidden")});
  ui.shell.addEventListener("wheel",function(event){
    if(!remover.image)return;event.preventDefault();setZoom(remover.zoom*(event.deltaY>0?.9:1.1))
  },{passive:false});

  function setView(view){
    remover.view=view;
    document.querySelectorAll("[data-br-view]").forEach(function(button){button.classList.toggle("active",button.dataset.brView===view)});
    drawDisplay()
  }
  function setBackground(name){
    remover.backgroundView=name;
    ui.shell.className="br-canvas-shell br-bg-"+name;
    ui.shell.dataset.tool=remover.tool;
    document.querySelectorAll("[data-br-background]").forEach(function(button){button.classList.toggle("active",button.dataset.brBackground===name)})
  }

  function resetAll(){
    if(!remover.image)return;
    ui.tolerance.value=18;ui.smooth.value=2;ui.halo.value=35;ui.edge.value=0;ui.brush.value=36;
    remover.background=inferBackground(remover.sourceData.data,remover.previewWidth,remover.previewHeight);
    ui.bgColor.value=rgbToHex(remover.background);remover.actions=[];remover.redo=[];remover.zoom=1;remover.panX=0;remover.panY=0;
    updateLabels();updateButtons();setTool("pan");analyze();setMessage("Réglages et corrections réinitialisés.","success")
  }

  function canvasBlob(canvas){
    return new Promise(function(resolve,reject){
      canvas.toBlob(function(blob){blob?resolve(blob):reject(new Error("Export PNG impossible."))},"image/png")
    })
  }
  function crc32(bytes){
    var table=crc32.table||(crc32.table=(function(){
      var values=new Uint32Array(256);
      for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;values[n]=c>>>0}
      return values
    })());
    var crc=0xffffffff;
    for(var i=0;i<bytes.length;i++)crc=table[(crc^bytes[i])&255]^(crc>>>8);
    return(crc^0xffffffff)>>>0
  }
  async function addPngDpi(blob,dpi){
    var source=new Uint8Array(await blob.arrayBuffer());
    if(source.length<33)return blob;
    var ppm=Math.round(dpi/0.0254),chunk=new Uint8Array(21),view=new DataView(chunk.buffer);
    view.setUint32(0,9);chunk.set([112,72,89,115],4);view.setUint32(8,ppm);view.setUint32(12,ppm);chunk[16]=1;
    view.setUint32(17,crc32(chunk.slice(4,17)));
    var output=new Uint8Array(source.length+chunk.length);
    output.set(source.slice(0,33),0);output.set(chunk,33);output.set(source.slice(33),54);
    return new Blob([output],{type:"image/png"})
  }

  async function buildOutput(){
    if(!remover.image)throw new Error("Ajoutez d’abord une image.");
    if(remover.busy)throw new Error("Un export est déjà en cours.");
    setBusy(true);setMessage("Création du PNG en pleine résolution…");
    await new Promise(function(resolve){setTimeout(resolve,40)});
    try{
      var width=remover.originalWidth,height=remover.originalHeight;
      var source=document.createElement("canvas"),ctx=source.getContext("2d",{willReadFrequently:true});
      source.width=width;source.height=height;ctx.drawImage(remover.image,0,0,width,height);
      var imageData=ctx.getImageData(0,0,width,height);
      var base=buildBaseMask(imageData,width,height,hexToRgb(ui.bgColor.value),Number(ui.tolerance.value)).mask;
      await new Promise(function(resolve){setTimeout(resolve,20)});
      var scale=width/remover.previewWidth,artifacts=createArtifacts(source,base,width,height,scale);
      var blob=await canvasBlob(artifacts.result);blob=await addPngDpi(blob,300);
      remover.lastOutput={blob:blob,width:width,height:height};
      setMessage("PNG transparent créé en pleine résolution et 300 DPI.","success");
      return blob
    }finally{setBusy(false)}
  }

  function outputName(){
    var base=(remover.file?remover.file.name:"design").replace(/\.[^.]+$/,"").replace(/[^\w\-]+/g,"-");
    return(base||"design")+"-fond-transparent-printelly-300dpi.png"
  }
  async function downloadOutput(){
    try{
      var blob=await buildOutput(),url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download=outputName();document.body.appendChild(link);link.click();link.remove();
      setTimeout(function(){URL.revokeObjectURL(url)},1800)
    }catch(error){setMessage(error.message,"error")}
  }
  async function addToOrder(){
    try{
      var blob=await buildOutput();
      if(typeof state==="undefined"||typeof renderFiles!=="function")throw new Error("La nouvelle commande n’est pas disponible.");
      var file=new File([blob],outputName(),{type:"image/png",lastModified:Date.now()});
      var widthCm=remover.originalWidth/300*2.54,heightCm=remover.originalHeight/300*2.54;
      if(widthCm>58){heightCm=heightCm*58/widthCm;widthCm=58}
      state.mode="visual";
      document.querySelectorAll('input[name="orderMode"]').forEach(function(radio){
        radio.checked=radio.value==="visual";
        var card=radio.closest(".mode-card");if(card)card.classList.toggle("selected",radio.checked)
      });
      state.files.push({
        id:typeof uuid==="function"?uuid():(crypto.randomUUID?crypto.randomUUID():String(Date.now())),
        file:file,width:Number(widthCm.toFixed(1)),height:Number(heightCm.toFixed(1)),
        quantity:1,length:1,copies:1,rotation:true
      });
      renderFiles();
      var orderButton=document.querySelector('[data-view="new-order"]');if(orderButton)orderButton.click();
      if(typeof toast==="function")toast("PNG transparent ajouté à la commande");
      setMessage("Votre PNG a été ajouté à la nouvelle commande.","success")
    }catch(error){setMessage(error.message,"error")}
  }

  ui.pick.onclick=function(){ui.input.click()};
  ui.drop.onclick=function(event){if(event.target.closest("button"))return;ui.input.click()};
  ui.drop.onkeydown=function(event){if(event.key==="Enter"||event.key===" "){event.preventDefault();ui.input.click()}};
  ui.input.onchange=function(event){
    var file=event.target.files&&event.target.files[0];
    if(file)loadFile(file).catch(function(error){setMessage(error.message,"error")});
    event.target.value=""
  };
  ["dragenter","dragover"].forEach(function(type){ui.drop.addEventListener(type,function(event){event.preventDefault();ui.drop.classList.add("dragging")})});
  ["dragleave","drop"].forEach(function(type){ui.drop.addEventListener(type,function(event){event.preventDefault();ui.drop.classList.remove("dragging")})});
  ui.drop.addEventListener("drop",function(event){
    var file=event.dataTransfer&&event.dataTransfer.files&&event.dataTransfer.files[0];
    if(file)loadFile(file).catch(function(error){setMessage(error.message,"error")})
  });

  ui.autoBg.onclick=function(){
    if(!remover.sourceData)return;
    remover.background=inferBackground(remover.sourceData.data,remover.previewWidth,remover.previewHeight);
    ui.bgColor.value=rgbToHex(remover.background);updateLabels();setMessage("Couleur dominante des bords détectée.","success");analyze()
  };
  ui.pipette.onclick=function(){
    if(!remover.image)return;
    remover.picking=true;setTool("pan");remover.picking=true;
    setMessage("Pipette active : cliquez sur la zone du fond à supprimer.")
  };
  ui.analyze.onclick=analyze;ui.reset.onclick=resetAll;ui.download.onclick=downloadOutput;ui.addOrder.onclick=addToOrder;
  ui.bgColor.addEventListener("input",function(){updateLabels();clearTimeout(remover.renderTimer);remover.renderTimer=setTimeout(analyze,180)});
  ui.tolerance.addEventListener("input",function(){updateLabels();clearTimeout(remover.renderTimer);remover.renderTimer=setTimeout(analyze,180)});
  [ui.smooth,ui.halo,ui.edge].forEach(function(control){control.addEventListener("input",function(){updateLabels();scheduleRender(90)})});
  ui.brush.addEventListener("input",updateLabels);
  document.querySelectorAll("[data-br-tool]").forEach(function(button){button.onclick=function(){setTool(button.dataset.brTool)}});
  document.querySelectorAll("[data-br-view]").forEach(function(button){button.onclick=function(){setView(button.dataset.brView)}});
  document.querySelectorAll("[data-br-background]").forEach(function(button){button.onclick=function(){setBackground(button.dataset.brBackground)}});
  ui.undo.onclick=function(){if(!remover.actions.length)return;remover.redo.push(remover.actions.pop());updateButtons();scheduleRender(10)};
  ui.redo.onclick=function(){if(!remover.redo.length)return;remover.actions.push(remover.redo.pop());updateButtons();scheduleRender(10)};
  ui.zoomOut.onclick=function(){setZoom(remover.zoom/1.2)};ui.zoomIn.onclick=function(){setZoom(remover.zoom*1.2)};
  ui.fit.onclick=function(){remover.zoom=1;remover.panX=0;remover.panY=0;updateCanvasSize()};
  window.addEventListener("resize",function(){clearTimeout(remover.resizeTimer);remover.resizeTimer=setTimeout(updateCanvasSize,100)});
  document.addEventListener("keydown",function(event){
    if(document.getElementById("bgRemoverView").classList.contains("hidden"))return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="z"){
      event.preventDefault();if(event.shiftKey)ui.redo.click();else ui.undo.click()
    }else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="y"){event.preventDefault();ui.redo.click()}
  });

  updateLabels();updateButtons();setTool("pan");setBackground("checker")
})();