import { useEffect } from 'react';

function Tasks() {
  const reproducirSonido = () => {
    const audio = new Audio('/notificacion.mp3');
    audio.play()
      .then(() => console.log("Sonido reproducido con éxito"))
      .catch(err => console.error("Error al reproducir:", err));
  };

  return (
    <div style={{ padding: '50px', textAlign: 'center' }}>
      <h1>Prueba de Sonido</h1>
      <button 
        onClick={reproducirSonido} 
        style={{ padding: '20px', fontSize: '20px', cursor: 'pointer' }}
      >
        HACÉ CLIC ACÁ PARA PROBAR
      </button>
    </div>
  );
}

export default Tasks;