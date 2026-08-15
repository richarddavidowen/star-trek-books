"use client";
import {useEffect,useState} from "react";

export default function LcarsToggle(){
  const [lcars,setLcars]=useState(false);
  useEffect(()=>{
    const saved=localStorage.getItem('star-trek-theme');
    const on=saved==='lcars';
    setLcars(on);
    document.documentElement.dataset.theme=on?'lcars':'classic';
  },[]);
  function toggle(){
    const next=!lcars;
    setLcars(next);
    document.documentElement.dataset.theme=next?'lcars':'classic';
    localStorage.setItem('star-trek-theme',next?'lcars':'classic');
  }
  return <button className="lcars-toggle" onClick={toggle} aria-pressed={lcars} title="Toggle LCARS interface">
    <span className="lcars-toggle-dot" />
    {lcars?'LCARS ON':'LCARS OFF'}
  </button>;
}
