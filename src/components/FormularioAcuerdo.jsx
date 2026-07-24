import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export default function FormularioAcuerdo({ onVolver, acuerdoAEditar }) {
  const [form, setForm] = useState(acuerdoAEditar || {
    fecha_acuerdo: new Date().toISOString().split('T')[0],
    id_paciente: '',
    id_prestacion: '',
    tipo_acuerdo: '', 
    monto_cuota_base: '',
    importe_actual: '',
    dia_vencimiento: '',
    admite_recargo: 'NO',
    estado: 'ACTIVO',
    observaciones: '',
    usuario: ''
  })

  const [pacientes, setPacientes] = useState([])
  const [prestaciones, setPrestaciones] = useState([])
  
  const [busquedaPaciente, setBusquedaPaciente] = useState('')
  const [pacienteSeleccionadoObj, setPacienteSeleccionadoObj] = useState(null)
  const [prestacionSeleccionada, setPrestacionSeleccionada] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    async function cargarDatosIniciales() {
      const { data: dataPacientes, error: errPac } = await supabase
        .from('pacientes_motor')
        .select('*')
        .order('nombre_apellido', { ascending: true })

      if (errPac) console.error('Error al cargar pacientes:', errPac.message)
      else setPacientes(dataPacientes || [])

      const { data: dataPrestaciones, error: errPres } = await supabase
        .from('prestaciones_motor')
        .select('*')
        .order('nombre_prestacion', { ascending: true })

      if (errPres) console.error('Error al cargar prestaciones:', errPres.message)
      else {
        setPrestaciones(dataPrestaciones || [])
        
        if (acuerdoAEditar) {
          if (acuerdoAEditar.id_prestacion && dataPrestaciones) {
            const encontrada = dataPrestaciones.find(p => p.id === acuerdoAEditar.id_prestacion || p.id_prestacion === acuerdoAEditar.id_prestacion)
            if (encontrada) setPrestacionSeleccionada(encontrada)
          }
          if (acuerdoAEditar.id_paciente && dataPacientes) {
            const pacEncontrado = dataPacientes.find(p => p.id === acuerdoAEditar.id_paciente || p.id_paciente === acuerdoAEditar.id_paciente)
            if (pacEncontrado) {
              setPacienteSeleccionadoObj(pacEncontrado)
              setBusquedaPaciente(pacEncontrado.nombre_apellido || '')
            }
          }
        }
      }
    }
    cargarDatosIniciales()
  }, [acuerdoAEditar])

  function handleChange(e) {
    const { name, value } = e.target
    setForm({ ...form, [name]: value })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault()
      const formElements = Array.from(e.currentTarget.elements).filter(
        el => el.tagName === 'INPUT' || el.tagName === 'SELECT'
      )
      const index = formElements.indexOf(e.target)
      if (index > -1 && index + 1 < formElements.length) {
        formElements[index + 1].focus()
      }
    }
  }

  function handleSeleccionarPaciente(paciente) {
    setPacienteSeleccionadoObj(paciente)
    setBusquedaPaciente(paciente.nombre_apellido)
    setForm({
      ...form,
      id_paciente: paciente.id || paciente.id_paciente
    })
  }

  function handlePrestacionChange(e) {
    const idPrestacion = e.target.value
    const prestacionObj = prestaciones.find(p => p.id == idPrestacion || p.id_prestacion == idPrestacion)

    if (prestacionObj) {
      setPrestacionSeleccionada(prestacionObj)
      
      const esUnicoPrestacion = prestacionObj.tipo_prestacion?.toLowerCase().includes('unico') || 
                                prestacionObj.tipo_prestacion?.toLowerCase().includes('único')

      setForm({
        ...form,
        id_prestacion: prestacionObj.id || prestacionObj.id_prestacion,
        tipo_acuerdo: prestacionObj.tipo_prestacion || '',
        monto_cuota_base: '',
        importe_actual: '',
        dia_vencimiento: esUnicoPrestacion ? '' : form.dia_vencimiento
      })
    } else {
      setPrestacionSeleccionada(null)
      setForm({
        ...form,
        id_prestacion: '',
        tipo_acuerdo: '',
        monto_cuota_base: '',
        importe_actual: ''
      })
    }
  }

  const pacientesFiltrados = busquedaPaciente.trim() === '' ? [] : pacientes.filter(p => 
    p.nombre_apellido?.toLowerCase().includes(busquedaPaciente.toLowerCase()) ||
    String(p.dni || '').includes(busquedaPaciente)
  )

  const esUnico = prestacionSeleccionada?.tipo_prestacion?.toLowerCase().includes('unico') || 
                  prestacionSeleccionada?.tipo_prestacion?.toLowerCase().includes('único')
  const esMensual = prestacionSeleccionada?.tipo_prestacion?.toLowerCase().includes('mensual')

  // Función interna para calcular el vencimiento de la cuota inicial por tercios (10, 20 o fin de mes)
  function calcularVencimientoCuotaInicial(fechaAcuerdoStr) {
    const [anio, mes, dia] = fechaAcuerdoStr.split('-').map(Number)
    let diaVenc

    if (dia <= 10) {
      diaVenc = 10
    } else if (dia <= 20) {
      diaVenc = 20
    } else {
      // Último día del mes actual
      diaVenc = new Date(anio, mes, 0).getDate()
    }

    const mesStr = String(mes).padStart(2, '0')
    const diaStr = String(diaVenc).padStart(2, '0')
    return `${anio}-${mesStr}-${diaStr}`
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!form.id_paciente) {
      alert('Por favor, selecciona un paciente de la lista.')
      return
    }
    if (!form.fecha_acuerdo) {
      alert('Por favor, completa la fecha del acuerdo.')
      return
    }
    if (!form.id_prestacion) {
      alert('Por favor, selecciona una prestación.')
      return
    }
    if (!form.monto_cuota_base) {
      alert('Por favor, completa el monto/importe base.')
      return
    }
    if (!esUnico && (form.dia_vencimiento === '' || form.dia_vencimiento === null)) {
      alert('Por favor, indica el día de vencimiento.')
      return
    }

    setGuardando(true)

    const datosGuardar = {
      id_paciente: parseInt(form.id_paciente, 10),
      id_prestacion: parseInt(form.id_prestacion, 10),
      fecha_acuerdo: form.fecha_acuerdo,
      tipo_acuerdo: form.tipo_acuerdo,
      monto_cuota_base: String(form.monto_cuota_base), 
      importe_actual: String(form.monto_cuota_base), 
      dia_vencimiento: esUnico ? null : parseInt(form.dia_vencimiento, 10),
      admite_recargo: esUnico ? 'NO' : form.admite_recargo,
      estado: form.estado || 'ACTIVO',
      observaciones: form.observaciones || '',
      usuario: form.usuario || 'Admin'
    }

    let error = null
    let idAcuerdoRegistrado = null
    const idAcuerdoEditar = acuerdoAEditar?.id_acuerdo || acuerdoAEditar?.id

    try {
      if (idAcuerdoEditar) {
        const { error: errUpdate } = await supabase
          .from('acuerdos_motor')
          .update(datosGuardar)
          .eq('id_acuerdo', idAcuerdoEditar)
        error = errUpdate
        idAcuerdoRegistrado = idAcuerdoEditar
      } else {
        const { data: dataInsert, error: errInsert } = await supabase
          .from('acuerdos_motor')
          .insert([datosGuardar])
          .select()

        error = errInsert
        if (!error && dataInsert && dataInsert.length > 0) {
          idAcuerdoRegistrado = dataInsert[0].id_acuerdo || dataInsert[0].id
        }
      }

      if (error) throw error;

      // Generación del renglón inicial en movimientoscuenta_motor para nuevos acuerdos
      if (!idAcuerdoEditar && idAcuerdoRegistrado && (esMensual || esUnico)) {
        const { data: ultMov } = await supabase
          .from('movimientoscuenta_motor')
          .select('id_movimiento')
          .order('id_movimiento', { ascending: false })
          .limit(1)

        const siguienteIdMovimiento = (ultMov && ultMov.length > 0 && ultMov[0].id_movimiento) ? ultMov[0].id_movimiento + 1 : 1;

        const { data: ultDeuda } = await supabase
          .from('movimientoscuenta_motor')
          .select('id_deuda')
          .order('id_deuda', { ascending: false })
          .limit(1)

        const siguienteIdDeuda = (ultDeuda && ultDeuda.length > 0 && ultDeuda[0].id_deuda) ? ultDeuda[0].id_deuda + 1 : 1;

        // REGLA CLAVE: 
        // - Si es UNICO: fecha_vencimiento es null (sin fecha de vencimiento).
        // - Si es MENSUAL (Cuota Inicial): se calcula por el sistema de tercios (10, 20 o fin de mes).
        let fechaVencimientoCalculada = null;
        if (esMensual) {
          fechaVencimientoCalculada = calcularVencimientoCuotaInicial(form.fecha_acuerdo);
        }

        const [anio, mes] = form.fecha_acuerdo.split('-');
        const cicloMoraCalculado = parseInt(`${anio}${mes}`, 10);

        const subtipoMovimiento = esMensual ? 'cuota_mensual' : 'acuerdo_unico';
        const conceptoMovimiento = esMensual ? 'cuota_inicial' : 'acuerdo_unico';

        const nuevoMovimiento = {
          id_movimiento: siguienteIdMovimiento,
          id_paciente: parseInt(form.id_paciente, 10),
          id_acuerdo: parseInt(idAcuerdoRegistrado, 10),
          id_deuda: siguienteIdDeuda,
          fecha_cuota_origen: form.fecha_acuerdo,
          fecha_vencimiento: fechaVencimientoCalculada, // NULL si es único, calculado por tercio si es cuota inicial mensual
          fecha_movimiento: new Date().toISOString().split('T')[0],
          ciclo_mora: cicloMoraCalculado,
          escalon_mora: '0',
          tipo_movimiento: 'cuota',
          subtipo: subtipoMovimiento,
          id_origen: null,
          concepto: conceptoMovimiento,
          debe: String(form.monto_cuota_base),
          haber: '0',
          saldo: '0',
          id_pago: null,
          usuario: form.usuario || 'Admin'
        };

        const { error: errMovimiento } = await supabase
          .from('movimientoscuenta_motor')
          .insert([nuevoMovimiento]);

        if (errMovimiento) {
          console.error('Error al registrar movimiento inicial en cuenta:', errMovimiento);
          alert('El acuerdo se guardó, pero hubo un error al registrar el movimiento inicial en la cuenta corriente: ' + errMovimiento.message);
        }
      }

      alert(idAcuerdoEditar ? '¡Acuerdo actualizado con éxito!' : '¡Acuerdo registrado con éxito y deuda inicial generada en cuenta corriente!');
      if (onVolver) onVolver()

    } catch (err) {
      alert('Error al guardar el acuerdo: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ maxWidth: '850px', margin: '0 auto', padding: '30px', background: '#fff', borderRadius: '12px', color: '#1e293b', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
      <h2 style={{ marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>
        {acuerdoAEditar ? 'Editar Acuerdo de Prestación' : 'Registrar Nuevo Acuerdo (Prestación a Paciente)'}
      </h2>

      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* SECCIÓN 1: SELECTOR DE PACIENTE */}
        <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0', position: 'relative' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px', color: '#0f172a' }}>
            Buscar y Seleccionar Paciente *
          </label>
          <input 
            type="text" 
            value={busquedaPaciente}
            onChange={(e) => {
              setBusquedaPaciente(e.target.value)
              setPacienteSeleccionadoObj(null)
              setForm({ ...form, id_paciente: '' })
            }}
            placeholder="Escriba el nombre o DNI del paciente..."
            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '15px' }}
          />

          {pacientesFiltrados.length > 0 && !pacienteSeleccionadoObj && (
            <ul style={{ 
              position: 'absolute', top: '75px', left: '15px', right: '15px', 
              background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', 
              maxHeight: '180px', overflowY: 'auto', listStyle: 'none', padding: '0', margin: '0', zIndex: 10, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' 
            }}>
              {pacientesFiltrados.map(p => (
                <li 
                  key={p.id || p.id_paciente}
                  onClick={() => handleSeleccionarPaciente(p)}
                  style={{ padding: '10px 15px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '14px' }}
                  onMouseEnter={(e) => e.target.style.background = '#f1f5f9'}
                  onMouseLeave={(e) => e.target.style.background = '#fff'}
                >
                  <strong>{p.nombre_apellido}</strong> {p.dni ? `- DNI: ${p.dni}` : ''}
                </li>
              ))}
            </ul>
          )}

          {pacienteSeleccionadoObj && (
            <div style={{ marginTop: '8px', fontSize: '13px', color: '#16a34a', fontWeight: 'bold' }}>
              ✓ Paciente seleccionado: {pacienteSeleccionadoObj.nombre_apellido} (ID: {pacienteSeleccionadoObj.id || pacienteSeleccionadoObj.id_paciente})
            </div>
          )}
        </div>

        {/* SECCIÓN 2: DATOS DEL ACUERDO */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
          
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Fecha del Acuerdo *</label>
            <input 
              type="date" 
              name="fecha_acuerdo" 
              value={form.fecha_acuerdo || ''} 
              onChange={handleChange} 
              style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1' }} 
              required 
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Tipo de Prestación *</label>
            <select 
              name="id_prestacion" 
              value={form.id_prestacion || ''} 
              onChange={handlePrestacionChange} 
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
              required
            >
              <option value="">-- Seleccionar Prestación --</option>
              {prestaciones.map((p) => (
                <option key={p.id || p.id_prestacion} value={p.id || p.id_prestacion}>
                  {p.nombre_prestacion} ({p.tipo_prestacion})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Tipo de Período (Automático)</label>
            <input 
              type="text" 
              name="tipo_acuerdo" 
              value={form.tipo_acuerdo || ''} 
              readOnly 
              placeholder="Se completa al seleccionar prestación"
              style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', color: '#64748b' }} 
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
              {esUnico ? 'Monto de la Prestación Única *' : esMensual ? 'Monto Cuota Base *' : 'Monto / Importe Base *'}
            </label>
            <input 
              type="number" 
              step="0.01"
              name="monto_cuota_base" 
              value={form.monto_cuota_base || ''} 
              onChange={handleChange} 
              disabled={!form.id_prestacion}
              placeholder={!form.id_prestacion ? 'Selecciona una prestación primero' : 'Ej: 15000'} 
              style={{ 
                width: '100%', 
                padding: '9px', 
                borderRadius: '6px', 
                border: '1px solid #cbd5e1',
                backgroundColor: !form.id_prestacion ? '#f1f5f9' : '#fff' 
              }} 
              required 
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Admite Recargo</label>
            <select 
              name="admite_recargo" 
              value={esUnico ? 'NO' : (form.admite_recargo || 'NO')} 
              onChange={handleChange} 
              disabled={esUnico}
              style={{ 
                width: '100%', 
                padding: '10px', 
                borderRadius: '6px', 
                border: '1px solid #cbd5e1', 
                backgroundColor: esUnico ? '#f1f5f9' : '#fff',
                cursor: esUnico ? 'not-allowed' : 'pointer'
              }}
            >
              <option value="SI">Sí</option>
              <option value="NO">No</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
              Día de Vencimiento Fijo (Meses Subsiguientes) {esUnico ? '(No aplica)' : '*'}
            </label>
            <input 
              type="number" 
              min="1" 
              max="31"
              name="dia_vencimiento" 
              value={esUnico ? '' : (form.dia_vencimiento || '')} 
              onChange={handleChange} 
              disabled={esUnico}
              placeholder={esUnico ? 'No aplica para pago único' : 'Ej: 15 (para meses siguientes)'} 
              style={{ 
                width: '100%', 
                padding: '9px', 
                borderRadius: '6px', 
                border: '1px solid #cbd5e1',
                backgroundColor: esUnico ? '#f1f5f9' : '#fff',
                cursor: esUnico ? 'not-allowed' : 'pointer'
              }} 
              required={!esUnico}
            />
          </div>

        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Observaciones</label>
          <textarea 
            name="observaciones" 
            value={form.observaciones || ''} 
            onChange={handleChange} 
            rows="3" 
            style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1' }} 
          />
        </div>

        <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
          <button 
            type="submit" 
            disabled={guardando}
            style={{ flex: 1, background: '#0f172a', color: '#fff', padding: '14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
          >
            {guardando ? 'Guardando...' : (acuerdoAEditar ? 'Guardar Cambios' : 'Registrar Acuerdo')}
          </button>
          
          <button 
            type="button" 
            onClick={() => { if (onVolver) onVolver() }}
            style={{ flex: 1, background: '#e2e8f0', color: '#1e293b', padding: '14px', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
          >
            Cancelar
          </button>
        </div>

      </form>
    </div>
  )
}