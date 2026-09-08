import { useState, useEffect } from 'react';

export default function BotonPantallaCompleta({ style = {} }) {
  const [esPantallaCompleta, setEsPantallaCompleta] = useState(
    typeof document !== 'undefined' ? !!(document.fullscreenElement || document.webkitFullscreenElement) : false
  );

  useEffect(() => {
    const handleFsChange = () => {
      setEsPantallaCompleta(!!(document.fullscreenElement || document.webkitFullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullScreen = () => {
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const el = document.documentElement;
        if (el.requestFullscreen) {
          el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        } else if (el.msRequestFullscreen) {
          el.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    } catch (err) {
      console.error("Error al cambiar modo de pantalla completa:", err);
    }
  };

  return (
    <button
      type="button"
      onClick={toggleFullScreen}
      title={esPantallaCompleta ? "Salir de pantalla completa (o presiona F11)" : "Ver en pantalla completa (o presiona F11)"}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: 'bold',
        cursor: 'pointer',
        border: '1px solid #475569',
        background: esPantallaCompleta ? '#1e293b' : '#0f172a',
        color: '#38bdf8',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
        transition: 'all 0.15s ease',
        userSelect: 'none',
        ...style
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.background = '#334155';
        e.currentTarget.style.borderColor = '#38bdf8';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = esPantallaCompleta ? '#1e293b' : '#0f172a';
        e.currentTarget.style.borderColor = '#475569';
      }}
    >
      <span style={{ fontSize: '14px' }}>{esPantallaCompleta ? '🗗' : '⛶'}</span>
      <span>{esPantallaCompleta ? 'Salir Pantalla Completa' : 'Pantalla Completa'}</span>
    </button>
  );
}
