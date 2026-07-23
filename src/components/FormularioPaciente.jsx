import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function FormularioPaciente({ onVolver, pacienteAEditar }) {
  // Inicializamos el formulario con los datos si estamos editando, o vacíos si es nuevo
  const [form, setForm] = useState(pacienteAEditar || {
    fecha_alta: '',
    estado: '',
    nombre_apellido: '',
    dni: '',
    sexo: '',
    fecha_nacimiento: '',
    edad: '',
    nombre_padre: '',
    nombre_madre: '',
    domicilio: '',
    escuela: '',
    turno: '',
    division: '',
    docente: '',
    docente_integrador: '',
    tel_docente_integrador: '',
    tel_padres: '',
    tel_alternativo: '',
    derivador: '',
    obra_social: '',
    nro_afiliado: '',
    diagnostico: '',
    observaciones: '',
    usuario: ''
  })

  const [guardando, setGuardando] = useState(false)

  // Función para calcular la edad interpretando el formato DD/MM/AAAA
  function calcularEdad(fechaStr) {
    if (!fechaStr) return ''
    
    const partes = fechaStr.split(/[\/\-\.]/)
    if (partes.length !== 3) return ''

    const dia = parseInt(partes[0], 10)
    const mes = parseInt(partes[1], 10) - 1
    const anio = parseInt(partes[2], 10)

    if (isNaN(dia) || isNaN(mes) || isNaN(anio)) return ''

    const anioCompleto = anio < 100 ? (anio > 30 ? 1900 + anio : 2000 + anio) : anio

    const nacimiento = new Date(anioCompleto, mes, dia)
    if (isNaN(nacimiento.getTime())) return ''

    const hoy = new Date()
    let edadCalculada = hoy.getFullYear() - nacimiento.getFullYear()
    const m = hoy.getMonth() - nacimiento.getMonth()

    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
      edadCalculada--
    }

    return edadCalculada >= 0 ? edadCalculada.toString() : ''
  }

  function handleChange(e) {
    const { name, value } = e.target
    
    if (name === 'fecha_nacimiento') {
      const edadCalculada = calcularEdad(value)
      setForm({
        ...form,
        fecha_nacimiento: value,
        edad: edadCalculada
      })
    } else {
      setForm({ ...form, [name]: value })
    }
  }

  // Función para que el Enter funcione como el Tab
  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const formElements = Array.from(e.currentTarget.elements)
      const index = formElements.indexOf(e.target)
      if (index > -1 && formElements[index + 1]) {
        formElements[index + 1].focus()
      }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    
    if (!form.nombre_apellido) {
      alert('Por favor, completa al menos el Nombre y Apellido del paciente.')
      return
    }

    setGuardando(true)

    let error = null
    const idEdicion = pacienteAEditar?.id || pacienteAEditar?.id_paciente

    if (idEdicion) {
      // MODO EDICIÓN: Excluimos cualquier campo de ID del cuerpo a actualizar
      const { id, id_paciente, created_at, ...datosAActualizar } = form

      const { error: errUpdate } = await supabase
        .from('pacientes_motor')
        .update(datosAActualizar)
        .eq(pacienteAEditar.id ? 'id' : 'id_paciente', idEdicion)
      
      error = errUpdate
    } else {
      // MODO NUEVO: Excluimos totalmente las propiedades de ID para que Supabase las genere automáticamente
      const { id, id_paciente, created_at, ...datosAInsertar } = form

      const { error: errInsert } = await supabase
        .from('pacientes_motor')
        .insert([datosAInsertar])
      
      error = errInsert
    }

    setGuardando(false)

    if (error) {
      alert('Error al guardar los datos: ' + error.message)
    } else {
      alert(idEdicion ? '¡Paciente actualizado con éxito!' : '¡Paciente guardado con éxito!')
      if (onVolver) onVolver()
    }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '30px', background: '#fff', borderRadius: '12px', color: '#1e293b', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
      <h2 style={{ marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>
        {pacienteAEditar ? 'Editar Ficha de Paciente' : 'Gestión Integral de Pacientes (Nuevo)'}
      </h2>
      
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* SECCIÓN 1: DATOS PERSONALES */}
        <div>
          <h4 style={{ color: '#3b82f6', marginBottom: '10px' }}>1. Datos Personales</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Nombre y Apellido *</label>
              <input type="text" name="nombre_apellido" value={form.nombre_apellido || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>DNI</label>
              <input type="text" name="dni" value={form.dni || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Sexo</label>
              <input type="text" name="sexo" value={form.sexo || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Fecha de Nacimiento</label>
              <input type="text" name="fecha_nacimiento" value={form.fecha_nacimiento || ''} onChange={handleChange} placeholder="Ej: 15/05/2010" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Edad</label>
              <input type="text" name="edad" value={form.edad || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }} readOnly />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Domicilio</label>
              <input type="text" name="domicilio" value={form.domicilio || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
          </div>
        </div>

        {/* SECCIÓN 2: GRUPO FAMILIAR Y CONTACTOS */}
        <div>
          <h4 style={{ color: '#3b82f6', marginBottom: '10px' }}>2. Familia y Contactos</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Nombre del Padre</label>
              <input type="text" name="nombre_padre" value={form.nombre_padre || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Nombre de la Madre</label>
              <input type="text" name="nombre_madre" value={form.nombre_madre || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Teléfono de Padres</label>
              <input type="text" name="tel_padres" value={form.tel_padres || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Teléfono Alternativo</label>
              <input type="text" name="tel_alternativo" value={form.tel_alternativo || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
          </div>
        </div>

        {/* SECCIÓN 3: ESCOLARES Y TERAPÉUTICOS */}
        <div>
          <h4 style={{ color: '#3b82f6', marginBottom: '10px' }}>3. Datos Escolares y Profesionales</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Escuela</label>
              <input type="text" name="escuela" value={form.escuela || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Turno</label>
              <input type="text" name="turno" value={form.turno || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>División</label>
              <input type="text" name="division" value={form.division || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Docente</label>
              <input type="text" name="docente" value={form.docente || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Docente Integrador</label>
              <input type="text" name="docente_integrador" value={form.docente_integrador || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Tel. Docente Integrador</label>
              <input type="text" name="tel_docente_integrador" value={form.tel_docente_integrador || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
          </div>
        </div>

        {/* SECCIÓN 4: ADMINISTRATIVOS Y MÉDICOS */}
        <div>
          <h4 style={{ color: '#3b82f6', marginBottom: '10px' }}>4. Datos Clínicos y Administrativos</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Fecha de Alta</label>
              <input type="text" name="fecha_alta" value={form.fecha_alta || ''} onChange={handleChange} placeholder="Ej: DD/MM/AAAA" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Estado</label>
              <input type="text" name="estado" value={form.estado || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Derivador</label>
              <input type="text" name="derivador" value={form.derivador || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Obra Social</label>
              <input type="text" name="obra_social" value={form.obra_social || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Nro. de Afiliado</label>
              <input type="text" name="nro_afiliado" value={form.nro_afiliado || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Usuario Responsable</label>
              <input type="text" name="usuario" value={form.usuario || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
            </div>
          </div>
          
          <div style={{ marginTop: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Diagnóstico</label>
            <textarea name="diagnostico" value={form.diagnostico || ''} onChange={handleChange} rows="2" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
          </div>

          <div style={{ marginTop: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Observaciones</label>
            <textarea name="observaciones" value={form.observaciones || ''} onChange={handleChange} rows="3" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />
          </div>
        </div>

        {/* BOTONES DE ACCIÓN */}
        <div style={{ display: 'flex', gap: '15px', marginTop: '15px' }}>
          <button 
            type="submit" 
            disabled={guardando}
            style={{ flex: 1, background: '#0f172a', color: '#fff', padding: '14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
          >
            {guardando ? 'Guardando...' : (pacienteAEditar ? 'Guardar Cambios' : 'Guardar Paciente')}
          </button>
          
          <button 
            type="button" 
            onClick={() => {
              if (onVolver) onVolver()
            }}
            style={{ flex: 1, background: '#e2e8f0', color: '#1e293b', padding: '14px', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}