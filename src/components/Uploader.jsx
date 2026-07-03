import { useState } from 'react';
// IMPORTANTE: Ajustamos la ruta para que coincida con tu archivo en lib/
import { supabase } from '../lib/supabase'; 

export default function Uploader({ pacienteId }) {
  const [file, setFile] = useState(null);
  const [cargando, setCargando] = useState(false);

  const handleUpload = async () => {
    if (!file) return alert("Por favor, selecciona un archivo primero.");
    if (!pacienteId) return alert("No se ha definido un ID de paciente.");
    
    setCargando(true);

    // Subimos al bucket 'documentos'
    // El archivo se guardará en la carpeta con el ID del paciente
    const { data, error } = await supabase.storage
      .from('documentos')
      .upload(`${pacienteId}/${file.name}`, file);

    setCargando(false);

    if (error) {
      console.error('Error detallado:', error);
      alert('Error al subir: ' + error.message);
    } else {
      alert('¡Archivo subido correctamente!');
      setFile(null); // Limpiamos el input
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px', marginTop: '10px' }}>
      <h4>Subir documento (Paciente: {pacienteId})</h4>
      <input 
        type="file" 
        onChange={(e) => setFile(e.target.files[0])} 
        accept=".pdf,.jpg,.jpeg,.png"
      />
      <button 
        onClick={handleUpload} 
        disabled={cargando}
        style={{ marginLeft: '10px' }}
      >
        {cargando ? 'Subiendo...' : 'Subir a Supabase'}
      </button>
    </div>
  );
}