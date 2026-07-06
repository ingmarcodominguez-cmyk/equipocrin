import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export default function Documentos() {
  const [pacientes, setPacientes] = useState([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [archivos, setArchivos] = useState([]);
  const [cargando, setCargando] = useState(false);

  // 1. Cargar lista de pacientes al iniciar
  useEffect(() => {
    const fetchPacientes = async () => {
      const { data, error } = await supabase
        .from('pacientes')
        .select('id_paciente_excel, nombre')
        .order('nombre');
      
      if (error) console.error("Error al cargar pacientes:", error);
      else setPacientes(data || []);
    };
    fetchPacientes();
  }, []);

  // 2. Función para buscar archivos (definida con useCallback para que sea estable)
  const fetchArchivos = useCallback(async () => {
    if (!pacienteSeleccionado) return;
    
    setCargando(true);
    const { data, error } = await supabase
      .from('documentos_pacientes')
      .select('*')
      .eq('id_paciente_excel', pacienteSeleccionado.id_paciente_excel)
      .order('created_at', { ascending: false }); // Opcional: muestra los últimos primero

    if (error) console.error("Error al buscar archivos:", error);
    else setArchivos(data || []);
    setCargando(false);
  }, [pacienteSeleccionado]);

  // 3. Efecto que dispara la búsqueda cada vez que cambia el paciente
  useEffect(() => {
    fetchArchivos();
  }, [fetchArchivos]);

  return (
    <div style={{ padding: '20px', color: '#fff' }}>
      <h3>📁 Gestión de Documentos</h3>
      
      <label>Seleccionar Paciente:</label>
      <select 
        onChange={(e) => {
          const p = pacientes.find(pac => String(pac.id_paciente_excel) === e.target.value);
          setPacienteSeleccionado(p || null);
        }}
        style={{ width: '100%', padding: '10px', marginTop: '10px', marginBottom: '20px', borderRadius: '5px', color: '#000' }}
      >
        <option value="">-- Seleccione un paciente --</option>
        {pacientes.map(p => (
          <option key={p.id_paciente_excel} value={p.id_paciente_excel}>{p.nombre}</option>
        ))}
      </select>

      {/* Botón de refresco manual */}
      {pacienteSeleccionado && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4>Archivos de: {pacienteSeleccionado.nombre}</h4>
          <button 
            onClick={fetchArchivos}
            disabled={cargando}
            style={{ cursor: 'pointer', padding: '8px 12px', borderRadius: '4px', backgroundColor: '#444', color: 'white', border: 'none' }}
          >
            {cargando ? "Actualizando..." : "🔄 Refrescar"}
          </button>
        </div>
      )}

      {cargando && !archivos.length && <p>Cargando documentos...</p>}

      {pacienteSeleccionado && !cargando && (
        <div>
          {archivos.length === 0 ? (
            <p>No se encontraron documentos para este paciente.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {archivos.map((doc, index) => (
                <li key={`${doc.id}-${index}`} style={{ marginBottom: '10px', padding: '10px', border: '1px solid #333', borderRadius: '5px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{doc.nombre_archivo}</span>
                  <button 
                    onClick={() => {
                      const urlPublica = `https://gqhfrzvtccxrixdtazzs.supabase.co/storage/v1/object/public/documentos_pacientes/${doc.url_storage}`;
                      const visorGoogle = `https://docs.google.com/viewer?url=${encodeURIComponent(urlPublica)}&embedded=true`;
                      window.open(visorGoogle, '_blank');
                    }}
                    style={{ cursor: 'pointer', padding: '5px 10px' }}
                  >
                    👁️ Ver
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}