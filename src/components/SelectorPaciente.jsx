import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export default function SelectorPaciente({ onSeleccionarPaciente, onVolver }) {
  const [pacientes, setPacientes] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)

  // Apenas se abre, traemos la lista de pacientes de Supabase
  useEffect(() => {
    async function obtenerPacientes() {
      const { data, error } = await supabase
        .from('pacientes_motor')
        .select('*')
        .order('nombre_apellido', { ascending: true })

      if (error) {
        alert('Error al cargar la lista de pacientes: ' + error.message)
      } else {
        setPacientes(data || [])
      }
      setCargando(false)
    }
    obtenerPacientes()
  }, [])

  // Filtramos los pacientes según lo que el usuario vaya escribiendo
  const pacientesFiltrados = pacientes.filter(p => 
    p.nombre_apellido?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.dni?.includes(busqueda)
  )

  return (
    <div style={{ maxWidth: '600px', margin: '40px auto', padding: '30px', background: '#fff', borderRadius: '12px', color: '#1e293b', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
      <h2 style={{ marginBottom: '15px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>Seleccionar Paciente a Editar</h2>
      <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>
        Escribí el nombre, apellido o DNI del paciente para buscarlo rápidamente:
      </p>

      {cargando ? (
        <p style={{ textAlign: 'center', padding: '20px' }}>Cargando lista de pacientes...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <input 
              type="text"
              placeholder="Ej: Juan Pérez o DNI..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              autoFocus
              style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '16px' }}
            />
          </div>

          {/* Lista desplegable / resultados filtrados */}
          <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
            {pacientesFiltrados.length === 0 ? (
              <p style={{ padding: '15px', textAlign: 'center', color: '#64748b' }}>No se encontraron pacientes.</p>
            ) : (
              pacientesFiltrados.map(paciente => (
                <div 
                  key={paciente.id}
                  onClick={() => onSeleccionarPaciente(paciente)}
                  style={{ 
                    padding: '12px 15px', 
                    borderBottom: '1px solid #f1f5f9', 
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  <span style={{ fontWeight: 'bold' }}>{paciente.nombre_apellido}</span>
                  <span style={{ color: '#64748b', fontSize: '14px' }}>DNI: {paciente.dni || 'Sin DNI'}</span>
                </div>
              ))
            )}
          </div>

          <button 
            type="button" 
            onClick={onVolver}
            style={{ background: '#e2e8f0', color: '#1e293b', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
          >
            Volver al Menú Principal
          </button>
        </div>
      )}
    </div>
  )
}