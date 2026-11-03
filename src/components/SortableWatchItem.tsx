import { useRef, useState, type ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
export function SortableWatchItem({symbol,active,onMove,children}:{symbol:string;active:boolean;onMove:(from:string,to:string)=>void;children:ReactNode}){
 const start=useRef<{x:number;y:number;over:string;moved:boolean}|null>(null),[dragging,setDragging]=useState(false);
 return <div className={`watch-item ${active?'active':''} ${dragging?'dragging':''}`} data-watch-symbol={symbol}>
 <button type="button" className="watch-drag-handle icon-btn" aria-label={`拖动排序 ${symbol}`} title="拖动排序，也可使用上下箭头" onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();start.current={x:e.clientX,y:e.clientY,over:symbol,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{
  const drag=start.current;if(!drag)return;
  if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6){drag.moved=true;setDragging(true);}
  if(!drag.moved)return;
  const row=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-watch-symbol]');if(row?.dataset.watchSymbol)drag.over=row.dataset.watchSymbol;
  const list=e.currentTarget.closest('.watch-items');if(list){const rect=list.getBoundingClientRect();if(e.clientY<rect.top+32)list.scrollTop-=12;else if(e.clientY>rect.bottom-32)list.scrollTop+=12;}
 }} onPointerUp={e=>{const drag=start.current;start.current=null;setDragging(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(drag?.moved&&drag.over!==symbol)onMove(symbol,drag.over);}} onPointerCancel={()=>{start.current=null;setDragging(false);}}><GripVertical size={16}/></button>{children}</div>;
}
