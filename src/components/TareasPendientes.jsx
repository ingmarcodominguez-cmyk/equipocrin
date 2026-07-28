import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function TareasPendientes({ onVolver }) {
  const [tareas, setTareas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');

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

  const filtradas = tareas.filter(t => 
    (t.nombre && t.nombre.toLowerCase().includes(busqueda.toLowerCase())) ||
    (t.tarea && t.tarea.toLowerCase().includes(busqueda.toLowerCase()))
  );

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

      <div style={{ marginBottom: '20px' }}>
        <input 
          type="text" 
          placeholder="Buscar por paciente o tarea..." 
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', outline: 'none' }}
        />
      </div>

      {cargando ? (
        <p style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>Cargando tareas pendientes...</p>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '30px', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
          {tareas.length === 0 ? '✨ ¡Excelente! No hay tareas pendientes registradas.' : 'No se encontraron tareas con esa búsqueda.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '550px', overflowY: 'auto' }}>
          {filtradas.map(t => (
            <div key={t.id} style={{ background: '#fcfdfd', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.01)', transition: 'border-color 0.2s' }}>
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
              <button
                onClick={() => marcarRealizada(t.id)}
                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', transition: 'background 0.2s', flexShrink: 0 }}
                onMouseOver={(e) => e.target.style.background = '#059669'}
                onMouseOut={(e) => e.target.style.background = '#10b981'}
              >
                ✓ Completar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
