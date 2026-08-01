import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function TareasPendientes({ onVolver }) {
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [agruparPorPaciente, setAgruparPorPaciente] = useState(true);
  
  // Estados para edición en línea
  const [editandoId, setEditandoId] = useState(null);
  const [editandoTexto, setEditandoTexto] = useState('');

  const cargarTareas = async () => {
    setCargando(true);
    try {
      const { data, error } = await supabase
        .from('observaciones_paciente_motor')
        .select('*')
        .eq('pendiente', 'SI')
        .order('fecha', { ascending: false });

      if (error) {
        if (error.code === 'P0001' || error.message.includes('relation') || error.message.includes('does not exist')) {
          console.warn("La tabla observaciones_paciente_motor no existe todavía.");
          setTareas([]);
        } else {
          throw error;
        }
      } else {
        setTareas(data || []);
      }
    } catch (err) {
      console.error("Error al cargar tareas pendientes:", err);
      alert("Error al cargar tareas pendientes: " + err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarTareas();
  }, []);

  const marcarRealizada = async (id) => {
    try {
      const { error } = await supabase
        .from('observaciones_paciente_motor')
        .update({ pendiente: 'NO' })
        .eq('id', id);

      if (error) throw error;
      
      // Actualizar localmente la lista para feedback instantáneo
      setTareas(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error("Error al marcar realizada:", err);
      alert("Error: " + err.message);
    }
  };

  const guardarEdicion = async (id) => {
    if (!editandoTexto.trim()) {
      alert("El detalle de la tarea no puede estar vacío.");
      return;
    }
    try {
      const { error } = await supabase
        .from('observaciones_paciente_motor')
        .update({ tarea: editandoTexto })
        .eq('id', id);

      if (error) throw error;
      
      setTareas(prev => prev.map(t => t.id === id ? { ...t, tarea: editandoTexto } : t));
      setEditandoId(null);
    } catch (err) {
      console.error("Error al editar tarea:", err);
      alert("Error al guardar cambios: " + err.message);
    }
  };

  const filtradas = tareas.filter(t => {
    const buscarLimpio = (busqueda || '').toLowerCase().trim();
    const matchNombre = (t.nombre || '').toLowerCase().includes(buscarLimpio);
    const matchTarea = (t.tarea || '').toLowerCase().includes(buscarLimpio);
    return matchNombre || matchTarea;
  });

  return (
    <div style={{ background: '#ffffff', padding: '30px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.08)', color: '#1e293b', fontFamily: 'Segoe UI, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
        <h3 style={{ margin: 0, color: '#5b21b6', fontSize: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          📋 Tareas Pendientes del Tratamiento
        </h3>
        <button
          onClick={onVolver}
          style={{ background: '#e2e8f0', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569' }}
        >
          ← Volver al Menú
        </button>
      </div>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <input 
          type="text" 
          placeholder="Buscar por paciente o tarea..." 
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none' }}
        />
        <button
          onClick={() => setAgruparPorPaciente(!agruparPorPaciente)}
          style={{ 
            background: agruparPorPaciente ? '#5b21b6' : '#e2e8f0', 
            color: agruparPorPaciente ? '#ffffff' : '#475569', 
            border: 'none', 
            padding: '12px 20px', 
            borderRadius: '10px', 
            cursor: 'pointer', 
            fontSize: '14px', 
            fontWeight: 'bold', 
            transition: 'all 0.2s',
            whiteSpace: 'nowrap'
          }}
        >
          👤 {agruparPorPaciente ? 'Desagrupar' : 'Agrupar por Paciente'}
        </button>
      </div>

      {cargando ? (
        <p style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>Cargando tareas pendientes...</p>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '30px', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
          {tareas.length === 0 ? '✨ ¡Excelente! No hay tareas pendientes registradas.' : 'No se encontraron tareas con esa búsqueda.'}
        </div>
      ) : agruparPorPaciente ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '550px', overflowY: 'auto' }}>
          {Object.entries(
            filtradas.reduce((acc, t) => {
              // Agrupar por id_paciente si existe, de lo contrario por nombre
              const key = t.id_paciente ? `ID_${t.id_paciente}` : `NAME_${t.nombre || 'Sin Paciente Asignado'}`;
              if (!acc[key]) acc[key] = [];
              acc[key].push(t);
              return acc;
            }, {})
          )
          .sort((a, b) => {
            const dateA = a[1][0]?.fecha || '';
            const dateB = b[1][0]?.fecha || '';
            if (dateA !== dateB) {
              return dateB.localeCompare(dateA); // Newest date first
            }
            const nameA = a[1][0]?.nombre || '';
            const nameB = b[1][0]?.nombre || '';
            return nameA.localeCompare(nameB); // Alphabetical fallback
          })
          .map(([grupoKey, tareasDelPaciente]) => {
            const nombrePaciente = tareasDelPaciente[0]?.nombre || 'Sin Paciente Asignado';
            return (
              <div key={grupoKey} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)' }}>
                <h4 style={{ margin: '0 0 15px 0', fontSize: '15px', fontWeight: 'bold', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                  👤 {nombrePaciente}
                  <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                    {tareasDelPaciente.length} {tareasDelPaciente.length === 1 ? 'tarea' : 'tareas'}
                  </span>
                </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[...tareasDelPaciente]
                  .sort((t1, t2) => {
                    const f1 = t1.fecha || '';
                    const f2 = t2.fecha || '';
                    if (f1 !== f2) {
                      return f2.localeCompare(f1);
                    }
                    return (t2.id || 0) - (t1.id || 0);
                  })
                  .map(t => (
                  <div key={t.id} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.01)' }}>
                    {editandoId === t.id ? (
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                            {t.fecha ? new Date(t.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/D'}
                          </span>
                        </div>
                        <textarea
                          value={editandoTexto}
                          onChange={(e) => setEditandoTexto(e.target.value)}
                          rows="2"
                          style={{ width: '100%', padding: '10px', border: '1px solid #c084fc', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', marginBottom: '8px' }}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => guardarEdicion(t.id)}
                            style={{ background: '#5b21b6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                          >
                            💾 Guardar
                          </button>
                          <button
                            onClick={() => setEditandoId(null)}
                            style={{ background: '#e2e8f0', color: '#475569', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '11px', background: '#fef3c7', color: '#b45309', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>PENDIENTE</span>
                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                              {t.fecha ? new Date(t.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/D'}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: '14px', color: '#475569', whiteSpace: 'pre-line' }}>{t.tarea}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                          <button
                            onClick={() => {
                              setEditandoId(t.id);
                              setEditandoTexto(t.tarea);
                            }}
                            style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: 'background 0.2s' }}
                            onMouseOver={(e) => e.target.style.background = '#f1f5f9'}
                            onMouseOut={(e) => e.target.style.background = 'transparent'}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => marcarRealizada(t.id)}
                            style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: 'background 0.2s' }}
                            onMouseOver={(e) => e.target.style.background = '#059669'}
                            onMouseOut={(e) => e.target.style.background = '#10b981'}
                          >
                            ✓ Completar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '550px', overflowY: 'auto' }}>
          {filtradas.map(t => (
            <div key={t.id} style={{ background: '#fcfdfd', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.01)', transition: 'border-color 0.2s' }}>
              {editandoId === t.id ? (
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>👤 {t.nombre}</span>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {t.fecha ? new Date(t.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/D'}
                    </span>
                  </div>
                  <textarea
                    value={editandoTexto}
                    onChange={(e) => setEditandoTexto(e.target.value)}
                    rows="3"
                    style={{ width: '100%', padding: '10px', border: '1px solid #c084fc', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', marginBottom: '8px' }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => guardarEdicion(t.id)}
                      style={{ background: '#5b21b6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                    >
                      💾 Guardar
                    </button>
                    <button
                      onClick={() => setEditandoId(null)}
                      style={{ background: '#e2e8f0', color: '#475569', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>👤 {t.nombre}</span>
                      <span style={{ fontSize: '11px', background: '#fef3c7', color: '#b45309', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>PENDIENTE</span>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {t.fecha ? new Date(t.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/D'}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: '#475569', whiteSpace: 'pre-line' }}>{t.tarea}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                    <button
                      onClick={() => {
                        setEditandoId(t.id);
                        setEditandoTexto(t.tarea);
                      }}
                      style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', transition: 'background 0.2s' }}
                      onMouseOver={(e) => e.target.style.background = '#f1f5f9'}
                      onMouseOut={(e) => e.target.style.background = 'transparent'}
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => marcarRealizada(t.id)}
                      style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', transition: 'background 0.2s' }}
                      onMouseOver={(e) => e.target.style.background = '#059669'}
                      onMouseOut={(e) => e.target.style.background = '#10b981'}
                    >
                      ✓ Completar
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
