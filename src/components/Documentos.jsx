import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export default function Documentos() {
  const [pacientes, setPacientes] = useState([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [archivos, setArchivos] = useState([]);
  const [cargando, setCargando] = useState(false);

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

  const fetchArchivos = useCallback(async () => {
    // Si no hay paciente, no hacemos nada
    if (!pacienteSeleccionado?.id_paciente_excel) return;
    
    setCargando(true);
    
    console.log("Buscando archivos para el ID:", pacienteSeleccionado.id_paciente_excel);

    const { data, error } = await supabase
      .from('documentos_pacientes')
      .select('*')
      // ASEGÚRATE: ¿La columna en Supabase se llama exactamente id_paciente_excel?
      .eq('id_paciente_excel', pacienteSeleccionado.id_paciente_excel);

    if (error) {
      console.error("Error de Supabase:", error);
    } else {
      console.log("Archivos encontrados:", data);
      setArchivos(data || []);
    }
    setCargando(false);
  }, [pacienteSeleccionado]);

  useEffect(() => {
    fetchArchivos();
  }, [fetchArchivos]);

  return (
    <div style={{ padding: '20px', color: '#fff' }}>
      <h3>📁 Gestión de Documentos</h3>
      
      <select 
        onChange={(e) => {
          const p = pacientes.find(pac => String(pac.id_paciente_excel) === e.target.value);
          setPacienteSeleccionado(p || null);
        }}
        style={{ width: '100%', padding: '10px', marginTop: '10px', borderRadius: '5px', color: '#000' }}
      >
        <option value="">-- Seleccione un paciente --</option>
        {pacientes.map(p => (
          <option key={p.id_paciente_excel} value={p.id_paciente_excel}>{p.nombre}</option>
        ))}
      </select>

      {pacienteSeleccionado && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <h4>Archivos de: {pacienteSeleccionado.nombre}</h4>
            <button onClick={fetchArchivos} disabled={cargando}>🔄 Refrescar</button>
          </div>

          {cargando ? <p>Cargando...</p> : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {archivos.length === 0 ? <p>No hay documentos para este paciente.</p> : 
               archivos.map((doc) => (
                // CORRECCIÓN: Usamos doc.id (debe ser único en tu DB) como key
                <li key={doc.id} style={{ marginBottom: '10px', padding: '10px', border: '1px solid #333', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{doc.nombre_archivo}</span>
                  <button onClick={() => {
                    const url = `https://gqhfrzvtccxrixdtazzs.supabase.co/storage/v1/object/public/documentos_pacientes/${doc.url_storage}`;
                    window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`, '_blank');
                  }}>👁️ Ver</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}