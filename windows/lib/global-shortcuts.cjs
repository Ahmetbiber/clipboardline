'use strict';
const ACTIONS=['toggle','search','library','copyLatest','screenshot'];

// A replacement is registered before its working predecessor is released.
// Failed OS registrations cannot silently remove a shortcut the user relies on.
class GlobalShortcuts{
 constructor(registry,handlers,{failed=()=>{}}={}){this.registry=registry;this.handlers=handlers;this.failed=failed;this.registered=new Map();}
 update(shortcuts){
  const rejected=[];
  for(const action of ACTIONS){
   const next=shortcuts[action]||'',previous=this.registered.get(action)||'';
   if(next===previous)continue;
   if(!next){if(previous)this.registry.unregister(previous);this.registered.delete(action);continue;}
   let success=false;try{success=this.registry.register(next,()=>{try{Promise.resolve(this.handlers[action]?.()).catch(this.failed);}catch(error){this.failed(error);}});}catch{}
   if(success){if(previous)this.registry.unregister(previous);this.registered.set(action,next);}
   else rejected.push({action,shortcut:next,previous});
  }
  return rejected;
 }
 dispose(){for(const shortcut of this.registered.values())this.registry.unregister(shortcut);this.registered.clear();}
}
module.exports={GlobalShortcuts,ACTIONS};
