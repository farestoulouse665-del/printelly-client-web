(function(){
  "use strict";

  var byId=function(id){return document.getElementById(id)};
  var studio={
    file:null,
    image:null,
    sourceCanvas:null,
    sourceData:null,
    previewWidth:0,
    previewHeight:0,
    originalWidth:0,
    originalHeight:0,
    background:[0,0,0],
    resultCanvas:null,
    lastBlob:null,
    lastOutput:{width:0,height:0},
    renderTimer:null,
    view:"result",
    busy:false
  };

  var controls={
    input:byId("htFileInput"),
    pick:byId("htPickFile"),
    drop:byId("htDropzone"),
    removeBg:byId("htRemoveBackground"),
    bgColor:byId("htBackgroundColor"),
    autoBg:byId("htAutoBackground"),
    tolerance:byId("htTolerance"),
    toleranceValue:byId("htToleranceValue"),
    cell:byId("htCellSize"),
    cellValue:byId("htCellSizeValue"),
    angle:byId("htAngle"),
    angleValue:byId("htAngleValue"),
    coverage:byId("htCoverage"),
    coverageValue:byId("htCoverageValue"),
    shape:byId("htShape"),
    colorMode:byId("htColorMode"),
    originalCanvas:byId("htOriginalCanvas"),
    resultCanvas:byId("htResultCanvas"),
    empty:byId("htPreviewEmpty"),
    meta:byId("htImageMeta"),
    backgroundInfo:byId("htBackgroundInfo"),
    resultInfo:byId("htResultInfo"),
    quality:byId("htQualityInfo"),
    download:byId("htDownload"),
    addOrder:byId("htAddToOrder"),
    reset:byId("htReset"),
    message:byId("htMessage")
  };

  if(!controls.input||!controls.resultCanvas)return;

  function studioMessage(text,type){
    controls.message.textContent=text||"";
    controls.message.className="ht-message"+(type?" "+type:"")
  }

  function openStudio(){
    document.querySelectorAll(".tabs button").forEach(function(button){
      button.classList.toggle("active",button.dataset.view==="halftone")
    });
    document.querySelectorAll(".app-page").forEach(function(page){
      page.classList.toggle("hidden",page.id!=="halftoneView")
    });
    window.scrollTo({top:0,behavior:"smooth"})
  }

  document.querySelectorAll(".js-halftone-nav").forEach(function(button){
    button.onclick=openStudio
  });

  function hexToRgb(hex){
    var clean=String(hex||"#000000").replace("#","");
    return [parseInt(clean.slice(0,2),16)||0,parseInt(clean.slice(2,4),16)||0,parseInt(clean.slice(4,6),16)||0]
  }

  function rgbToHex(rgb){
    return "#"+rgb.map(function(value){return Math.max(0,Math.min(255,Math.round(value))).toString(16).padStart(2,"0")}).join("")
  }

  function inferBackground(data,width,height){
    var bins=new Map(),step=Math.max(1,Math.floor(Math.max(width,height)/450));
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

  function colorMatch(data,pixel,bg,limitSq){
    if(data[pixel+3]<16)return true;
    var dr=data[pixel]-bg[0],dg=data[pixel+1]-bg[1],db=data[pixel+2]-bg[2];
    return dr*dr*.30+dg*dg*.59+db*db*.11<=limitSq
  }

  function removeEdgeBackground(imageData,width,height,bg,tolerance,enabled){
    if(!enabled)return{imageData:imageData,removed:0};
    var data=imageData.data,n=width*height,mask=new Uint8Array(n),removed=0;
    var limit=8+Number(tolerance)*2.15,limitSq=limit*limit;

    function matches(index){return colorMatch(data,index*4,bg,limitSq)}
    function flood(seed){
      var stack=[seed];
      while(stack.length){
        var index=stack.pop();
        if(mask[index]||!matches(index))continue;
        var y=Math.floor(index/width),x=index-y*width,row=y*width,left=x,right=x;
        while(left>0&&!mask[row+left-1]&&matches(row+left-1))left--;
        while(right<width-1&&!mask[row+right+1]&&matches(row+right+1))right++;
        for(var fillX=left;fillX<=right;fillX++){mask[row+fillX]=1;removed++}
        for(var direction=-1;direction<=1;direction+=2){
          var nextY=y+direction;
          if(nextY<0||nextY>=height)continue;
          var nextRow=nextY*width,scan=left;
          while(scan<=right){
            while(scan<=right&&(mask[nextRow+scan]||!matches(nextRow+scan)))scan++;
            if(scan<=right){
              stack.push(nextRow+scan);
              scan++;
              while(scan<=right&&!mask[nextRow+scan]&&matches(nextRow+scan))scan++
            }
          }
        }
      }
    }

    for(var x=0;x<width;x++){
      var top=x,bottom=(height-1)*width+x;
      if(!mask[top]&&matches(top))flood(top);
      if(!mask[bottom]&&matches(bottom))flood(bottom)
    }
    for(var y=0;y<height;y++){
      var left=y*width,right=left+width-1;
      if(!mask[left]&&matches(left))flood(left);
      if(!mask[right]&&matches(right))flood(right)
    }
    for(var i=0;i<n;i++)if(mask[i])data[i*4+3]=0;
    return{imageData:imageData,removed:removed}
  }

  function renderHalftone(imageData,width,height,options){
    var canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
    canvas.width=width;canvas.height=height;
    var data=imageData.data,cell=Math.max(3,options.cell),halfSample=cell*.34;
    var radians=options.angle*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
    var centerX=width/2,centerY=height/2,diagonal=Math.sqrt(width*width+height*height);
    var start=-diagonal/2-cell,end=diagonal/2+cell;
    ctx.clearRect(0,0,width,height);

    for(var gy=start;gy<=end;gy+=cell){
      for(var gx=start;gx<=end;gx+=cell){
        var sx=centerX+gx*cos-gy*sin,sy=centerY+gx*sin+gy*cos;
        if(sx<-cell||sy<-cell||sx>width+cell||sy>height+cell)continue;
        var alpha=0,red=0,green=0,blue=0,luminance=0,count=0;
        for(var yy=-1;yy<=1;yy++){
          for(var xx=-1;xx<=1;xx++){
            var px=Math.max(0,Math.min(width-1,Math.round(sx+xx*halfSample)));
            var py=Math.max(0,Math.min(height-1,Math.round(sy+yy*halfSample)));
            var index=(py*width+px)*4,a=data[index+3]/255;
            alpha+=a;red+=data[index]*a;green+=data[index+1]*a;blue+=data[index+2]*a;
            luminance+=(data[index]*.2126+data[index+1]*.7152+data[index+2]*.0722)*a;
            count++
          }
        }
        if(alpha<.08)continue;
        var opacity=Math.min(1,alpha/count),r=red/alpha,g=green/alpha,b=blue/alpha;
        var tone=options.colorMode==="mono"?Math.max(.05,1-(luminance/alpha)/255):1;
        var area=Math.max(.01,opacity*(options.coverage/100)*tone);
        var radius=cell*.49*Math.sqrt(area);
        if(radius<.35)continue;
        ctx.fillStyle=options.colorMode==="mono"?"#111318":"rgb("+Math.round(r)+","+Math.round(g)+","+Math.round(b)+")";
        ctx.beginPath();
        if(options.shape==="square"){
          ctx.save();ctx.translate(sx,sy);ctx.rotate(radians);ctx.rect(-radius,-radius,radius*2,radius*2);ctx.restore()
        }else if(options.shape==="diamond"){
          ctx.moveTo(sx,sy-radius);ctx.lineTo(sx+radius,sy);ctx.lineTo(sx,sy+radius);ctx.lineTo(sx-radius,sy);ctx.closePath()
        }else{
          ctx.arc(sx,sy,radius,0,Math.PI*2)
        }
        ctx.fill()
      }
    }
    return canvas
  }

  function readOptions(scale){
    return{
      removeBackground:controls.removeBg.checked,
      background:hexToRgb(controls.bgColor.value),
      tolerance:Number(controls.tolerance.value),
      cell:Number(controls.cell.value)*scale,
      angle:Number(controls.angle.value),
      coverage:Number(controls.coverage.value),
      shape:controls.shape.value,
      colorMode:controls.colorMode.value
    }
  }

  function updateControlLabels(){
    controls.toleranceValue.textContent=controls.tolerance.value+" %";
    controls.cellValue.textContent=controls.cell.value+" px";
    controls.angleValue.textContent=controls.angle.value+"°";
    controls.coverageValue.textContent=controls.coverage.value+" %"
  }

  function drawPreview(){
    if(!studio.sourceData)return;
    updateControlLabels();
    var copy=new ImageData(new Uint8ClampedArray(studio.sourceData.data),studio.previewWidth,studio.previewHeight);
    var options=readOptions(1);
    var cleaned=removeEdgeBackground(copy,studio.previewWidth,studio.previewHeight,options.background,options.tolerance,options.removeBackground);
    var rendered=renderHalftone(cleaned.imageData,studio.previewWidth,studio.previewHeight,options);
    controls.resultCanvas.width=studio.previewWidth;controls.resultCanvas.height=studio.previewHeight;
    controls.resultCanvas.getContext("2d").clearRect(0,0,studio.previewWidth,studio.previewHeight);
    controls.resultCanvas.getContext("2d").drawImage(rendered,0,0);
    var percent=cleaned.removed/(studio.previewWidth*studio.previewHeight)*100;
    controls.backgroundInfo.innerHTML=options.removeBackground
      ?"<strong>"+percent.toLocaleString("fr-DZ",{maximumFractionDigits:1})+" %</strong><span>du fond extérieur détecté. Les éléments isolés au centre restent protégés.</span>"
      :"<strong>Fond conservé</strong><span>Activez la suppression pour obtenir une transparence prête pour le DTF.</span>";
    controls.resultInfo.textContent="Aperçu actualisé • traitement local et privé";
    studio.lastBlob=null;
    showView(studio.view)
  }

  function schedulePreview(){
    clearTimeout(studio.renderTimer);
    controls.resultInfo.textContent="Mise à jour de l’aperçu…";
    studio.renderTimer=setTimeout(function(){
      try{drawPreview()}catch(error){studioMessage("Aperçu impossible : "+error.message,"error")}
    },90)
  }

  function showView(view){
    studio.view=view;
    var original=view==="original";
    controls.originalCanvas.classList.toggle("hidden",!original);
    controls.resultCanvas.classList.toggle("hidden",original);
    document.querySelectorAll("[data-ht-view]").forEach(function(button){
      button.classList.toggle("active",button.dataset.htView===view)
    })
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

  async function loadFile(file){
    if(!file||!/^image\/(png|jpeg|webp)$/i.test(file.type))throw new Error("Choisissez une image PNG, JPG ou WebP.");
    if(file.size>45*1024*1024)throw new Error("L’image dépasse 45 Mo.");
    studioMessage("Analyse de l’image…");
    var image=await decodeImage(file),width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
    if(!width||!height)throw new Error("Dimensions de l’image introuvables.");
    if(width*height>80000000)throw new Error("L’image est trop grande. Maximum conseillé : 80 mégapixels.");
    studio.file=file;studio.image=image;studio.originalWidth=width;studio.originalHeight=height;
    var scale=Math.min(1,1600/Math.max(width,height),2500000/(width*height));
    scale=Math.min(1,Math.sqrt(scale));
    var previewWidth=Math.max(1,Math.round(width*scale)),previewHeight=Math.max(1,Math.round(height*scale));
    var source=document.createElement("canvas"),ctx=source.getContext("2d",{willReadFrequently:true});
    source.width=previewWidth;source.height=previewHeight;ctx.drawImage(image,0,0,previewWidth,previewHeight);
    studio.sourceCanvas=source;studio.sourceData=ctx.getImageData(0,0,previewWidth,previewHeight);
    studio.previewWidth=previewWidth;studio.previewHeight=previewHeight;
    studio.background=inferBackground(studio.sourceData.data,previewWidth,previewHeight);
    controls.bgColor.value=rgbToHex(studio.background);
    controls.originalCanvas.width=previewWidth;controls.originalCanvas.height=previewHeight;
    controls.originalCanvas.getContext("2d").drawImage(source,0,0);
    controls.empty.classList.add("hidden");
    controls.meta.textContent=width.toLocaleString("fr-DZ")+" × "+height.toLocaleString("fr-DZ")+" px • "+formatBytes(file.size);
    var maxCm=Math.min(58,width/300*2.54),heightCm=maxCm*height/width;
    controls.quality.innerHTML="<strong>Sortie 300 DPI</strong><span>Dimension conseillée : "+maxCm.toLocaleString("fr-DZ",{maximumFractionDigits:1})+" × "+heightCm.toLocaleString("fr-DZ",{maximumFractionDigits:1})+" cm.</span>";
    controls.download.disabled=false;controls.addOrder.disabled=false;
    drawPreview();
    studioMessage("Image prête. Vérifiez le fond sur le damier.","success")
  }

  function formatBytes(bytes){
    if(bytes<1024)return bytes+" o";
    if(bytes<1048576)return(bytes/1024).toFixed(1)+" Kio";
    return(bytes/1048576).toFixed(1)+" Mio"
  }

  function chooseOutputSize(){
    var pixels=studio.originalWidth*studio.originalHeight,maxPixels=18000000,maxSide=6000;
    var scale=Math.min(1,Math.sqrt(maxPixels/pixels),maxSide/Math.max(studio.originalWidth,studio.originalHeight));
    return{width:Math.max(1,Math.round(studio.originalWidth*scale)),height:Math.max(1,Math.round(studio.originalHeight*scale)),scale:scale}
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
    view.setUint32(0,9);chunk.set([112,72,89,115],4);
    view.setUint32(8,ppm);view.setUint32(12,ppm);chunk[16]=1;
    view.setUint32(17,crc32(chunk.slice(4,17)));
    var output=new Uint8Array(source.length+chunk.length);
    output.set(source.slice(0,33),0);output.set(chunk,33);output.set(source.slice(33),54);
    return new Blob([output],{type:"image/png"})
  }

  async function buildOutput(){
    if(!studio.image)throw new Error("Ajoutez d’abord une image.");
    if(studio.busy)throw new Error("Le traitement est déjà en cours.");
    studio.busy=true;controls.download.disabled=true;controls.addOrder.disabled=true;
    studioMessage("Création du PNG haute résolution…");
    await new Promise(function(resolve){setTimeout(resolve,30)});
    try{
      var size=chooseOutputSize(),source=document.createElement("canvas"),ctx=source.getContext("2d",{willReadFrequently:true});
      source.width=size.width;source.height=size.height;ctx.drawImage(studio.image,0,0,size.width,size.height);
      var data=ctx.getImageData(0,0,size.width,size.height),previewScale=size.width/studio.previewWidth,options=readOptions(previewScale);
      var cleaned=removeEdgeBackground(data,size.width,size.height,options.background,options.tolerance,options.removeBackground);
      var rendered=renderHalftone(cleaned.imageData,size.width,size.height,options);
      var blob=await canvasBlob(rendered);
      blob=await addPngDpi(blob,300);
      studio.lastBlob=blob;studio.lastOutput={width:size.width,height:size.height};
      var reduced=size.scale<.999?" • optimisée à "+size.width+" × "+size.height+" px pour la stabilité mobile":"";
      studioMessage("PNG professionnel créé en 300 DPI"+reduced+".","success");
      return blob
    }finally{
      studio.busy=false;controls.download.disabled=false;controls.addOrder.disabled=false
    }
  }

  function outputName(){
    var base=(studio.file?studio.file.name:"design").replace(/\.[^.]+$/,"").replace(/[^\w\-]+/g,"-");
    return(base||"design")+"-printelly-halftone-300dpi.png"
  }

  async function downloadOutput(){
    try{
      var blob=await buildOutput(),url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download=outputName();document.body.appendChild(link);link.click();link.remove();
      setTimeout(function(){URL.revokeObjectURL(url)},1500)
    }catch(error){studioMessage(error.message,"error")}
  }

  async function addToOrder(){
    try{
      var blob=await buildOutput();
      if(typeof state==="undefined"||typeof renderFiles!=="function")throw new Error("La commande n’est pas disponible.");
      var file=new File([blob],outputName(),{type:"image/png",lastModified:Date.now()});
      var widthCm=Math.min(58,studio.lastOutput.width/300*2.54);
      var heightCm=widthCm*studio.lastOutput.height/studio.lastOutput.width;
      state.mode="visual";
      document.querySelectorAll('input[name="orderMode"]').forEach(function(radio){
        radio.checked=radio.value==="visual";
        radio.closest(".mode-card").classList.toggle("selected",radio.checked)
      });
      state.files.push({id:typeof uuid==="function"?uuid():crypto.randomUUID(),file:file,width:Number(widthCm.toFixed(1)),height:Number(heightCm.toFixed(1)),quantity:1,length:1,copies:1,rotation:true});
      renderFiles();
      var orderButton=document.querySelector('[data-view="new-order"]');
      if(orderButton)orderButton.click();
      if(typeof toast==="function")toast("Design Halftone ajouté à la commande");
      studioMessage("Design ajouté à votre nouvelle commande.","success")
    }catch(error){studioMessage(error.message,"error")}
  }

  function resetControls(){
    controls.removeBg.checked=true;controls.tolerance.value=18;controls.cell.value=10;
    controls.angle.value=22;controls.coverage.value=78;controls.shape.value="circle";controls.colorMode.value="color";
    updateControlLabels();if(studio.sourceData)schedulePreview()
  }

  controls.pick.onclick=function(){controls.input.click()};
  controls.drop.onclick=function(event){if(event.target.closest("button"))return;controls.input.click()};
  controls.input.onchange=function(event){
    var file=event.target.files&&event.target.files[0];
    if(file)loadFile(file).catch(function(error){studioMessage(error.message,"error")});
    event.target.value=""
  };
  ["dragenter","dragover"].forEach(function(type){controls.drop.addEventListener(type,function(event){event.preventDefault();controls.drop.classList.add("dragging")})});
  ["dragleave","drop"].forEach(function(type){controls.drop.addEventListener(type,function(event){event.preventDefault();controls.drop.classList.remove("dragging")})});
  controls.drop.addEventListener("drop",function(event){
    var file=event.dataTransfer&&event.dataTransfer.files&&event.dataTransfer.files[0];
    if(file)loadFile(file).catch(function(error){studioMessage(error.message,"error")})
  });

  controls.autoBg.onclick=function(){
    if(!studio.sourceData)return;
    studio.background=inferBackground(studio.sourceData.data,studio.previewWidth,studio.previewHeight);
    controls.bgColor.value=rgbToHex(studio.background);schedulePreview()
  };
  controls.reset.onclick=resetControls;
  controls.download.onclick=downloadOutput;
  controls.addOrder.onclick=addToOrder;
  document.querySelectorAll("[data-ht-view]").forEach(function(button){button.onclick=function(){showView(button.dataset.htView)}});
  document.querySelectorAll("[data-ht-preset]").forEach(function(button){
    button.onclick=function(){
      var preset=button.dataset.htPreset;
      if(preset==="fine"){controls.cell.value=6;controls.coverage.value=72;controls.angle.value=22}
      else if(preset==="strong"){controls.cell.value=16;controls.coverage.value=92;controls.angle.value=45}
      else{controls.cell.value=10;controls.coverage.value=78;controls.angle.value=22}
      schedulePreview()
    }
  });
  [controls.removeBg,controls.bgColor,controls.tolerance,controls.cell,controls.angle,controls.coverage,controls.shape,controls.colorMode].forEach(function(control){
    control.addEventListener("input",schedulePreview);control.addEventListener("change",schedulePreview)
  });
  updateControlLabels()
})();