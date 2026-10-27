/* Heru Universe — perspective camera, WebGL starfield and accessible DOM destinations.
   Presentation only. Reads the existing Map response; never writes to an API. */
(function () {
  'use strict';
  const colours=['#64d9bb','#69b8ff','#f6aa6b','#ff7c8c','#b7a0ff','#ef9ec9','#ffc66d','#b6c6d7'];
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icons={project:'◈',app:'▦',skill:'ϟ',job:'◷',doc:'▤',link:'↗',hub:'⌂'};
  window.HeruUniverse={mount:function(opts){
    const stage=opts.stage,layer=opts.layer,projects=opts.projects,items=opts.items;
    let canvas=opts.canvas;
    const reduce=matchMedia('(prefers-reduced-motion: reduce)'),coarse=matchMedia('(pointer: coarse)');
    let seed=41;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
    let width=1,height=1,dpr=1,raf=0,last=0,visible=true,dragged=false,active=null,selected=null,quality='auto',motion=opts.motion&&!reduce.matches;
    let yaw=.1,pitch=.45,distance=23,tyaw=yaw,tpitch=pitch,tdistance=distance,target=[0,0,0],ttarget=[0,0,0],lastInput=performance.now(),points=[],markers=[],pointers=new Map(),pinch=0;
    try{const q=localStorage.getItem('heruUniverseQuality');if(['auto','eco','high'].includes(q))quality=q}catch(e){}
    document.getElementById('uQuality').value=quality;
    let gl=null,ctx=null,program,buffer,lineBuffer,lineCount=0,locations,uniforms,fallback=false,contextLost=false;
    const allItems=items.slice();
    const grouped=p=>allItems.filter(n=>(n.kind==='app'?'App Builder':n.project)===p.name);
    const destinations=projects.map((p,i)=>{
      // Separated in depth as well as around the centre: the camera can travel between them.
      const angle=i/projects.length*Math.PI*2-Math.PI/2;
      const pos=[Math.cos(angle)*8.2,Math.sin(angle)*4.8,Math.sin(angle*2+.5)*1.6];
      return {data:p,pos,colour:colours[i%colours.length],children:grouped(p)};
    });
    let core={data:{id:'heru',name:'HERU',kind:'hub'},pos:[0,0,0],colour:'#ffd39a'};
    const inspector=document.getElementById('uInspector'),crumb=document.getElementById('uCrumb'),status=document.getElementById('uStatus'),help=document.getElementById('uHint');
    function tell(text){status.textContent=text;}
    function addPoint(pos,c,size,alpha,group){points.push({pos,c:rgb(c),size,alpha,group});}
    function makePoints(){
      points=[];seed=41;
      const low=quality==='eco'||(quality==='auto'&&innerWidth<600),bg=low?650:1500,cloud=low?140:300;
      for(let i=0;i<bg;i++){
        const a=rnd()*Math.PI*2,z=(rnd()*2-1),r=12+rnd()*28,k=Math.sqrt(1-z*z);
        addPoint([Math.cos(a)*r*k,z*r*.65,Math.sin(a)*r*k],rnd()>.91?'#ffd7a6':'#b5cee8',.012+rnd()*.035,.2+rnd()*.5,-1);
      }
      // A luminous spiral core, a dust plane and a sparse halo rather than a solid globe.
      for(let i=0;i<(low?650:1600);i++){
        const r=Math.pow(rnd(),1.3)*4.1,a=r*1.8+(i%3)*Math.PI*2/3+(rnd()-.5)*.7;
        addPoint([Math.cos(a)*r,(rnd()-.5)*(.2+r*.17),Math.sin(a)*r],rnd()>.3?'#ffc27b':'#e6f2ff',.025+rnd()*.05,.5+rnd()*.5,-1);
      }
      destinations.forEach((p,k)=>{
        for(let i=0;i<cloud;i++){
          const a=rnd()*6.28,z=rnd()*2-1,r=Math.pow(rnd(),.6)*.82,xy=Math.sqrt(1-z*z);
          addPoint([p.pos[0]+Math.cos(a)*r*xy,p.pos[1]+z*r*.6,p.pos[2]+Math.sin(a)*r*xy],p.colour,.028+rnd()*.055,.4+rnd()*.6,k);
        }
      });
      upload();
    }
    function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
    function initGL(){
      try{
        gl=canvas.getContext('webgl',{alpha:true,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:false});
        if(!gl)throw Error('WebGL unavailable');
        program=gl.createProgram();
        gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec3 p;attribute vec3 c;attribute float s;attribute float a;uniform vec3 right;uniform vec3 up;uniform vec3 back;uniform vec3 target;uniform float distance;uniform float aspect;uniform float ratio;varying vec3 color;varying float alpha;void main(){vec3 v=p-target;float z=distance-dot(v,back);gl_Position=vec4(dot(v,right)*1.9/aspect,dot(v,up)*1.9,z*.998-.2,z);gl_PointSize=clamp(s*1900.0*ratio/max(z,.1),1.0,48.0);color=c;alpha=a*step(.15,z);}'));
        gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 color;varying float alpha;uniform float pointMode;void main(){if(pointMode<.5){gl_FragColor=vec4(color,alpha);return;}float r=length(gl_PointCoord-.5)*2.0;if(r>1.0)discard;float glow=pow(1.0-r,2.4);float core=pow(1.0-r,12.0);gl_FragColor=vec4(color*(.8+core*.7),alpha*(glow*1.1+core*.85));}'));
        gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Star shader link failed');
        buffer=gl.createBuffer();lineBuffer=gl.createBuffer();locations={};['p','c','s','a'].forEach(k=>locations[k]=gl.getAttribLocation(program,k));
        uniforms={};['right','up','back','target','distance','aspect','ratio','pointMode'].forEach(k=>uniforms[k]=gl.getUniformLocation(program,k));
        gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.disable(gl.DEPTH_TEST);
      }catch(e){
        // A fresh canvas can obtain a 2D context even after a WebGL failure.
        const next=canvas.cloneNode();canvas.replaceWith(next);canvas=next;gl=null;ctx=canvas.getContext('2d');fallback=true;
      }
    }
    // canvas must be replaceable when a browser cannot create WebGL.
    function basis(){const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);return {right:[cy,0,-sy],up:[-sy*sp,cp,-cy*sp],back:[sy*cp,sp,cy*cp]};}
    const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    function project(pos,b){const v=pos.map((x,i)=>x-target[i]),z=distance-dot(v,b.back);return {x:width/2+dot(v,b.right)*height*.95/z,y:height/2-dot(v,b.up)*height*.95/z,z};}
    function upload(){
      if(!gl||contextLost)return;
      const arr=new Float32Array(points.length*8);let n=0;
      points.forEach(p=>{arr.set(p.pos,n);arr.set(p.c,n+3);arr[n+6]=p.size;arr[n+7]=p.alpha*(active&&p.group>=0&&destinations[p.group]!==active?.17:1);n+=8});
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,arr,gl.STATIC_DRAW);
      const links=[];const link=(a,b,c,alpha)=>{for(let i=0;i<18;i++){for(const t of [i/18,(i+1)/18]){const p=a.map((x,k)=>x+(b[k]-x)*t+(k===1?Math.sin(t*Math.PI)*.65:0));links.push(...p,...rgb(c),1,alpha)}}};
      if(active){markers.filter(m=>m.isChild).forEach(m=>link(active.pos,m.pos,active.colour,selected&&m.data.id===selected.id?.5:.14));}else destinations.forEach(p=>link([0,0,0],p.pos,p.colour,.13));
      lineCount=links.length/8;gl.bindBuffer(gl.ARRAY_BUFFER,lineBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(links),gl.STATIC_DRAW);
    }
    function drawStars(b){
      if(contextLost)return;
      if(gl){
        gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        [['p',3,0],['c',3,3],['s',1,6],['a',1,7]].forEach(([k,size,off])=>{gl.enableVertexAttribArray(locations[k]);gl.vertexAttribPointer(locations[k],size,gl.FLOAT,false,32,off*4)});
        ['right','up','back'].forEach(k=>gl.uniform3fv(uniforms[k],b[k]));gl.uniform3fv(uniforms.target,target);gl.uniform1f(uniforms.distance,distance);gl.uniform1f(uniforms.aspect,width/height);gl.uniform1f(uniforms.ratio,dpr);gl.uniform1f(uniforms.pointMode,1);gl.drawArrays(gl.POINTS,0,points.length);
        gl.bindBuffer(gl.ARRAY_BUFFER,lineBuffer);[['p',3,0],['c',3,3],['s',1,6],['a',1,7]].forEach(([k,size,off])=>gl.vertexAttribPointer(locations[k],size,gl.FLOAT,false,32,off*4));gl.uniform1f(uniforms.pointMode,0);gl.drawArrays(gl.LINES,0,lineCount);
      }else if(ctx){
        ctx.clearRect(0,0,width,height);points.forEach(p=>{const v=project(p.pos,b);if(v.z<.2||v.x<0||v.y<0||v.x>width||v.y>height)return;ctx.globalAlpha=p.alpha*(active&&p.group>=0&&destinations[p.group]!==active?.17:1);ctx.fillStyle='rgb('+p.c.map(x=>Math.round(x*255)).join(',')+')';ctx.beginPath();ctx.arc(v.x,v.y,clamp(p.size*360/v.z,.4,5),0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1;
      }
    }
    function marker(d,isChild){
      const b=document.createElement('button');b.type='button';b.className='u-node'+(isChild?' child':'');b.style.setProperty('--node',d.colour);b.dataset.node=d.data.id;if(d.data.id==='heru')b.classList.add('core');
      b.setAttribute('aria-label',(d.data.kind==='project'?'Explore project ':d.data.kind+': ')+d.data.name+(d.data.overdue?', '+d.data.overdue+' overdue':''));
      b.innerHTML='<span class="u-node-dot" aria-hidden="true">'+icons[d.data.kind]+'</span><span class="u-node-name">'+escape(d.data.name)+'</span>';
      if(d.data.overdue)b.innerHTML+='<span class="u-node-alert">'+d.data.overdue+' overdue</span>';else if(d.data.fixes&&d.data.fixes.length)b.innerHTML+='<span class="u-node-alert pending">'+d.data.fixes.length+' fixes</span>';
      if(d.data.kind==='project')b.innerHTML+='<span class="u-node-meta">'+d.data.open+' open · '+d.data.chats+' chats</span>';
      b.addEventListener('click',()=>{if(dragged)return;if(d.data.kind==='project')focusProject(d.data.name);else if(d===core)reset();else{focusItem(d.data);opts.onSelect(d.data)}});
      layer.appendChild(b);return {...d,button:b,isChild};
    }
    function buildMarkers(){
      layer.textContent='';markers=[marker(core,false)];destinations.forEach(p=>markers.push(marker(p,false)));
      if(active){active.children.forEach((n,i)=>{const a=i*2.399963,r=1.25+Math.sqrt(i)*.19,y=((i%5)-2)*.28;const pos=[active.pos[0]+Math.cos(a)*r,active.pos[1]+y,active.pos[2]+Math.sin(a)*r];markers.push(marker({data:n,pos,colour:active.colour},true))});}
    }
    function positionMarkers(b){
      const occupied=[];
      markers.slice().sort((a,b)=>Number(a.isChild)-Number(b.isChild)).forEach(m=>{
        const p=project(m.pos,b),hide=p.z<.4||p.x<15||p.x>width-15||p.y<20||p.y>height-35||(active&&!m.isChild&&m.data.id!==active.data.id&&m!==markers[0]);
        const focused=selected&&m.data.id===selected.id,primary=m.data.kind==='project'||m.data.id==='heru';
        const labelWidth=primary?(width<520?100:130):42,labelHeight=primary?(width<520?46:66):42;
        const collide=occupied.some(r=>Math.abs(p.x-r.x)<(r.w+labelWidth)*.43&&Math.abs(p.y-r.y)<(r.h+labelHeight)*.43);
        const hidden=hide||(collide&&!focused);m.button.hidden=hidden;m.button.tabIndex=hidden?-1:0;
        if(!hidden){m.button.style.left=(primary&&width<520?clamp(p.x,53,width-53):p.x)+'px';m.button.style.top=p.y+'px';m.button.style.zIndex=String(Math.round(100-p.z));m.button.classList.toggle('selected',!!focused);occupied.push({x:p.x,y:p.y,w:labelWidth,h:labelHeight});}
      });
    }
    function render(){if(!visible||contextLost)return;const b=basis();drawStars(b);positionMarkers(b);stage.dataset.distance=distance.toFixed(3);stage.dataset.yaw=yaw.toFixed(3);stage.dataset.project=active?active.data.name:'';}
    function animate(now){
      raf=0;if(!visible||document.hidden)return;const dt=Math.min((now-last)||16,40);last=now;
      const moving=Math.abs(yaw-tyaw)+Math.abs(pitch-tpitch)+Math.abs(distance-tdistance)+target.reduce((t,x,i)=>t+Math.abs(x-ttarget[i]),0)>.002;
      const ease=reduce.matches?1:1-Math.exp(-dt/115);yaw+=(tyaw-yaw)*ease;pitch+=(tpitch-pitch)*ease;distance+=(tdistance-distance)*ease;target=target.map((x,i)=>x+(ttarget[i]-x)*ease);
      if(motion&&!pointers.size&&now-lastInput>3500)tyaw+=dt*.000035;
      render();if(moving||motion||pointers.size)raf=requestAnimationFrame(animate);
    }
    function wake(){if(visible&&!document.hidden&&!raf){last=performance.now();raf=requestAnimationFrame(animate)}}
    function act(){lastInput=performance.now();wake()}
    function resize(){
      const r=stage.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);dpr=Math.min(devicePixelRatio||1,quality==='high'?2:quality==='eco'?1:1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);render();wake();
    }
    function content(){
      const n=active?active.children:items,apps=n.filter(x=>x.kind==='app').length,skills=n.filter(x=>x.kind==='skill').length,jobs=n.filter(x=>x.kind==='job').length;
      crumb.textContent='';const home=document.createElement('button');home.type='button';home.textContent='Heru';home.onclick=reset;crumb.appendChild(home);
      if(active){const sep=document.createElement('span');sep.textContent=' / ';crumb.appendChild(sep);const t=document.createElement('span');t.textContent=active.data.name;crumb.appendChild(t)}
      const title=active?active.data.name:'Everything, connected.';
      inspector.innerHTML='<div class="u-eyebrow">'+(active?'PROJECT CONSTELLATION':'YOUR WORKSPACE')+'</div><h2>'+escape(title)+'</h2><p>'+(active?escape(active.data.about):'Choose a constellation to fly into its skills, routines and connections.')+'</p><div class="u-counts"><span><b>'+apps+'</b> apps</span><span><b>'+skills+'</b> skills</span><span><b>'+jobs+'</b> routines</span></div><div class="u-inspector-list"></div>';
      const list=inspector.querySelector('.u-inspector-list');
      if(active){
        if(!n.length)list.innerHTML='<p class="u-empty">No nodes filed here yet. Open the board to see this project’s work.</p>';
        n.forEach(it=>{const bt=document.createElement('button');bt.type='button';bt.innerHTML='<span aria-hidden="true">'+icons[it.kind]+'</span><span>'+escape(it.name)+'</span><small>'+escape(it.kind)+'</small>';bt.onclick=()=>{focusItem(it);opts.onSelect(it)};list.appendChild(bt)});
      }else destinations.forEach(p=>{const bt=document.createElement('button');bt.type='button';bt.style.setProperty('--node',p.colour);bt.innerHTML='<i></i><span>'+escape(p.data.name)+'</span><small>'+p.data.open+' open</small>';bt.onclick=()=>focusProject(p.data.name);list.appendChild(bt)});
      document.querySelectorAll('[data-u-project]').forEach(b=>b.setAttribute('aria-pressed',String(!!active&&b.dataset.uProject===active.data.name)));
    }
    function focusProject(name){
      active=destinations.find(p=>p.data.name===name)||null;selected=null;
      if(!active){reset();return}ttarget=active.pos.slice();tdistance=width<520?8.8:7;tyaw=.15;tpitch=.32;
      opts.onFilter&&opts.onFilter(name);buildMarkers();upload();content();tell('Exploring '+name+'. '+active.children.length+' destinations.');act();
    }
    function focusItem(n){
      const group=n.kind==='app'?'App Builder':n.project;
      if(!active||active.data.name!==group)focusProject(group);
      selected=n;upload();const m=markers.find(m=>m.data.id===n.id);if(m){ttarget=m.pos.slice();tdistance=5.5}tell(n.name+' selected. Details open below.');act();
    }
    function reset(){active=null;selected=null;ttarget=[0,0,0];tdistance=width<520?25:15.5;tyaw=.08;tpitch=.2;opts.onFilter&&opts.onFilter(null);buildMarkers();upload();content();tell('All projects. Choose a constellation or explore the stars.');act();}
    function updateHelp(){help.textContent=coarse.matches?'Pinch to zoom · drag to orbit · tap a destination. Scroll outside the stars to move down the page.':'Drag to orbit · scroll to zoom · choose a project to fly in';}
    function zoom(factor){tdistance=clamp(tdistance*factor,2.2,48);act()}
    stage.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'&&e.target.closest('button,a,input,select'))return;if(pointers.size>=2)return;dragged=false;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const a=[...pointers.values()];pinch=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}e.target.setPointerCapture(e.pointerId);lastInput=performance.now()});
    stage.addEventListener('pointermove',e=>{
      if(!pointers.has(e.pointerId))return;const prev=pointers.get(e.pointerId),dx=e.clientX-prev.x,dy=e.clientY-prev.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size===2){const a=[...pointers.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(pinch&&d>0)zoom(pinch/d);pinch=d;dragged=true}else{tyaw-=dx*.006;tpitch=clamp(tpitch+dy*.005,-1.3,1.3);if(Math.abs(dx)+Math.abs(dy)>2)dragged=true;act()}
    });
    const release=e=>{pointers.delete(e.pointerId);pinch=0;setTimeout(()=>{dragged=false},50);act()};stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);stage.addEventListener('lostpointercapture',release);
    stage.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(clamp(e.deltaY,-160,160)*.0018))},{passive:false});
    stage.addEventListener('keydown',e=>{if(e.target!==stage)return;let handled=true;if(e.key==='ArrowLeft')tyaw-=.2;else if(e.key==='ArrowRight')tyaw+=.2;else if(e.key==='ArrowUp')tpitch=clamp(tpitch-.15,-1.3,1.3);else if(e.key==='ArrowDown')tpitch=clamp(tpitch+.15,-1.3,1.3);else if(e.key==='+'||e.key==='=')zoom(.8);else if(e.key==='-')zoom(1.25);else if(e.key==='Home')reset();else handled=false;if(handled){e.preventDefault();act()}});
    document.getElementById('uZoomIn').onclick=()=>zoom(.78);document.getElementById('uZoomOut').onclick=()=>zoom(1.28);document.getElementById('uReset').onclick=reset;
    document.getElementById('uQuality').onchange=e=>{quality=e.target.value;try{localStorage.setItem('heruUniverseQuality',quality)}catch(e){}makePoints();resize();act()};
    const chips=document.getElementById('legend');chips.textContent='';destinations.forEach(p=>{const b=document.createElement('button');b.type='button';b.dataset.uProject=p.data.name;b.style.setProperty('--node',p.colour);b.innerHTML='<i></i>'+escape(p.data.name);b.onclick=()=>active===p?reset():focusProject(p.data.name);chips.appendChild(b)});
    initGL();canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;cancelAnimationFrame(raf);raf=0;tell('Graphics paused. Use the project list or reload to restore the scene.')});canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;initGL();makePoints();resize();wake()});
    makePoints();resize();reset();updateHelp();
    reduce.addEventListener('change',()=>{if(reduce.matches){motion=false;opts.onMotionChange&&opts.onMotionChange(false)}wake()});
    const ro=new ResizeObserver(resize);ro.observe(stage);
    return {setAlerts(board){const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'});destinations.forEach(p=>p.data.overdue=(board.items||[]).filter(i=>!i.done&&i.project===p.data.name&&i.due_on&&String(i.due_on).slice(0,10)<today).length);buildMarkers();render()},resize,draw:render,focusProject,focusItem,reset,setMotion(on){motion=!!on&&!reduce.matches;act()},setVisible(on){visible=on;if(!on){cancelAnimationFrame(raf);raf=0;pointers.clear()}else wake()},diagnostics(){return {renderer:fallback?'perspective-2d':'webgl',points:points.length,distance,target:target.slice(),yaw,pitch,project:active?active.data.name:null,motion,raf:!!raf,quality,visible,selected:selected&&selected.id}}};
  }};
})();