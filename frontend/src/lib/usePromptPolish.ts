import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { appendPromptPolishHistory, createPromptPolishHistoryEntry, resolveActivePromptPolishHistoryId, type PromptPolishHistoryEntry } from "./promptPolishHistory";
import { isPromptPolishTransition } from "./promptPolishOwnership";

type CreationMode = "generate" | "edit" | "video";
type UsePromptPolishOptions = {
  prompt: string; creationMode: CreationMode; referenceImages?: string[]; sourceSurface?: "studio" | "canvas";
  sourceKey?: unknown; draftIdentity?: object;
  onPromptChange: (value: string) => void; onPolished?: () => void;
  onApply?: (value: string, polished: boolean, isCurrent: () => boolean) => void;
};
type DraftVersion = { identity: unknown; prompt: string; references: string[] };
type Context = { active: boolean; serial: number; polishing: boolean; promise: Promise<void> | null; history: PromptPolishHistoryEntry[]; error: string; notice: string; expectedPrompt?: string };
export function usePromptPolish({prompt,creationMode,referenceImages=[],sourceSurface="studio",sourceKey,draftIdentity,onPromptChange,onPolished,onApply}: UsePromptPolishOptions) {
  const [,redraw]=useState(0),fallbackKey=useRef({});
  const refsKey=JSON.stringify(referenceImages.filter(Boolean));
  const context=useMemo<Context>(()=>({active:false,serial:0,polishing:false,promise:null,history:[],error:"",notice:""}),[sourceKey ?? fallbackKey.current,creationMode,refsKey,sourceSurface]);
  const version=useMemo<DraftVersion>(()=>({identity:draftIdentity ?? prompt,prompt,references:JSON.parse(refsKey) as string[]}),[draftIdentity,prompt,refsKey]);
  const currentRef=useRef<{context:Context;version:DraftVersion}>({context,version});
  const current=()=>context.active && currentRef.current.context===context && currentRef.current.version===version;
  const publish=()=>{if(context.active && currentRef.current.context===context)redraw(n=>n+1);};
  useLayoutEffect(()=>{
    const previous=currentRef.current;
    if(previous.context!==context)previous.context.active=false;
    context.active=true;currentRef.current={context,version};
    if(previous.context===context && previous.version!==version){
      const own=isPromptPolishTransition(previous.version.identity,version.identity) || (draftIdentity===undefined && context.expectedPrompt===version.prompt);
      const changed=context.polishing || (!own && Boolean(context.error || context.notice));
      context.serial++;context.polishing=false;context.promise=null;context.expectedPrompt=undefined;
      if(!own){context.error="";context.notice="";}
      if(changed)publish();
    }
    return()=>{context.active=false;};
  },[context,version]);
  function apply(value:string,polished:boolean,guard:()=>boolean){
    if(!guard())return;
    context.expectedPrompt=value;
    if(onApply)onApply(value,polished,guard);
    else {onPromptChange(value);if(polished && guard())onPolished?.();}
  }
  function historyValue(entryId:string,source:boolean){
    if(!current())return;
    const entry=context.history.find(row=>row.id===entryId);if(!entry)return;
    const serial=++context.serial,guard=()=>current() && context.serial===serial;
    context.polishing=false;context.promise=null;context.error="";context.notice="";
    apply(source ? entry.sourcePrompt : entry.polishedPrompt,!source,guard);publish();
  }
  const polishPrompt=useCallback(async()=>{
    if(!current())return;
    if(context.polishing)return context.promise ?? undefined;
    const trimmed=version.prompt.trim();if(!trimmed){context.error="请先输入提示词。";publish();return;}
    const serial=++context.serial,guard=()=>current() && context.serial===serial;
    context.polishing=true;context.error="";context.notice="";publish();
    const request=(async()=>{
      try {
        const result=await api.polishPrompt({prompt:trimmed,creation_mode:creationMode,reference_images:version.references.slice(),source_surface:sourceSurface});
        if(!guard())return;
        if(typeof result.polished_prompt!=="string" || !result.polished_prompt.trim())throw new Error("润色结果为空，请保留原文后重试。");
        const polished=result.polished_prompt.trim(),entry=createPromptPolishHistoryEntry(trimmed,polished);
        context.history=appendPromptPolishHistory(context.history,entry);
        context.notice=typeof result.reference_image_warning==="string" ? result.reference_image_warning : "";
        apply(polished,true,guard);
      } catch(error) {if(guard())context.error=error instanceof Error ? error.message : "提示词润色失败";}
      finally {if(guard()){context.polishing=false;context.promise=null;publish();}}
    })();context.promise=request;return request;
  },[context,version,creationMode,sourceSurface,onApply,onPromptChange,onPolished]);
  return {polishing:context.polishing,polishPrompt,error:context.error,notice:context.notice,history:context.history,
    activeHistoryId:resolveActivePromptPolishHistoryId(context.history,prompt),
    applyHistoryEntry:(id:string)=>historyValue(id,false),applySourceEntry:(id:string)=>historyValue(id,true),
    clearError:()=>{if(current()){context.error="";publish();}},clearNotice:()=>{if(current()){context.notice="";publish();}}};
}
