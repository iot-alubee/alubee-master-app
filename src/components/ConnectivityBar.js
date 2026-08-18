import React, { useEffect, useState } from 'react';

export default function ConnectivityBar() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline  = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Only show when offline
  if (online) return null;

  return (
    <div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:9999,background:'#fef2f2',borderTop:'2px solid #dc2626',padding:'6px 16px',display:'flex',alignItems:'center',gap:8,fontFamily:"'DM Sans',sans-serif"}}>
      <span style={{color:'#dc2626',fontSize:14}}>●</span>
      <span style={{fontSize:12,fontWeight:700,color:'#dc2626'}}>Offline — changes will sync when reconnected</span>
    </div>
  );
}
