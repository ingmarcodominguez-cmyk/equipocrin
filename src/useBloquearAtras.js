import { useEffect } from 'react';

export function useBloquearAtras() {
  useEffect(() => {
    // Al montar la pantalla, añadimos un estado al historial
    window.history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      // Cada vez que toque la flecha atrás, volvemos a empujar el historial
      // para que el navegador "piense" que siempre hay una página adelante
      window.history.pushState(null, "", window.location.href);
      
      // Opcional: puedes hacer un pequeño aviso o log
      // alert("Usa los botones de la pantalla para navegar.");
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);
}