import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function SimuladorMotorMora() {
  const [fechaSimulada, setFechaSimulada] = useState(new Date().toISOString().split('T')[0])
  const [cargando, setCargando] = useState(false)
  const [logResultados, setLogResultados] = useState([])

  async function ejecutarMotorMora() {
    setCargando(true)
    // Limpiamos los logs anteriores al iniciar una nueva prueba
    const logs = []
    logs.push(`🚀 Iniciando proceso de mora con fecha de trabajo: ${fechaSimulada}`)
    setLogResultados(logs)

    try {
      // 1. Traemos TODOS los movimientos para calcular saldos reales agrupados por id_deuda
      const { data: todosLosMovimientos, error: errMov } = await supabase
        .from('movimientoscuenta_motor')
        .select('*')

      if (errMov) throw errMov

      if (!todosLosMovimientos || todosLosMovimientos.length === 0) {
        logs.push('ℹ️ No se encontraron movimientos en la tabla.')
        setLogResultados([...logs])
        setCargando(false)
        return
      }

      // 2. Identificar las deudas base (cuota_mensual, acuerdo_unico, etc.) que marcan el origen
      const deudasBase = todosLosMovimientos.filter(m => m.subtipo === 'cuota_mensual' || m.subtipo === 'acuerdo_unico')

      logs.push(`🔍 Se encontraron ${deudasBase.length} registros de deuda base para evaluar.`)
      setLogResultados([...logs])

      const fechaTrabajo = new Date(fechaSimulada + 'T00:00:00')

      // Buscar último id_movimiento para los nuevos inserts
      const { data: ultMov } = await supabase
        .from('movimientoscuenta_motor')
        .select('id_movimiento')
        .order('id_movimiento', { ascending: false })
        .limit(1)

      let siguienteIdMovimiento = (ultMov && ultMov.length > 0) ? (ultMov[0].id_movimiento || 0) + 1 : 1

      for (const deudaOriginal of deudasBase) {
        const idDeudaActual = deudaOriginal.id_deuda || deudaOriginal.id_movimiento
        const fechaVencStr = deudaOriginal.fecha_vencimiento

        if (!fechaVencStr) continue

        // 3. Filtrar todos los movimientos que pertenecen a este id_deuda para calcular su saldo real
        const movimientosDeEstaDeuda = todosLosMovimientos.filter(m => (m.id_deuda || m.id_movimiento) === idDeudaActual)

        const totalDebe = movimientosDeEstaDeuda.reduce((acc, m) => acc + parseFloat(m.debe || 0), 0)
        const totalHaber = movimientosDeEstaDeuda.reduce((acc, m) => acc + parseFloat(m.haber || 0), 0)
        const saldoDeuda = totalDebe - totalHaber

        logs.push(`--- ID Deuda: ${idDeudaActual} | Vencimiento: ${fechaVencStr} | Saldo Actual: $${saldoDeuda} ---`)
        setLogResultados([...logs])

        if (saldoDeuda <= 0) {
          logs.push(`   -> La deuda está totalmente saldada (Saldo: $${saldoDeuda}). Sin acciones.`)
          setLogResultados([...logs])
          continue
        }

        const fechaVencObj = new Date(fechaVencStr + 'T00:00:00')
        const diferenciaTiempo = fechaTrabajo.getTime() - fechaVencObj.getTime()
        const diasAtraso = Math.floor(diferenciaTiempo / (1000 * 3600 * 24))

        logs.push(`   -> Días de atraso a la fecha ${fechaSimulada}: ${diasAtraso}`)
        setLogResultados([...logs])

        if (diasAtraso <= 0) {
          logs.push(`   -> Aún no está vencida.`)
          setLogResultados([...logs])
          continue
        }

        const escalonesAplicados = movimientosDeEstaDeuda
          .filter(m => m.subtipo?.startsWith('recargo_'))
          .map(m => parseInt(m.escalon_mora || '0', 10))
          .filter(e => !isNaN(e))

        const maxEscalon = escalonesAplicados.length > 0 ? Math.max(...escalonesAplicados) : 0
        logs.push(`   -> Escalón de mora actual máximo: ${maxEscalon}`)
        setLogResultados([...logs])

        // REGLA 1: Aplicar Recargo 1 (10%) si pasó 1 día o más y maxEscalon == 0
        if (diasAtraso >= 1 && maxEscalon === 0) {
          const recargo10 = parseFloat((saldoDeuda * 0.10).toFixed(2))

          logs.push(`   ⚡ Aplicando RECARGO 1 (10% sobre saldo $${saldoDeuda}): $${recargo10}`)
          setLogResultados([...logs])

          const [anio, mes] = fechaSimulada.split('-')
          const cicloMoraCalculado = parseInt(`${anio}${mes}`, 10)

          const nuevoMovRecargo = {
            id_movimiento: siguienteIdMovimiento++,
            id_paciente: deudaOriginal.id_paciente,
            id_acuerdo: deudaOriginal.id_acuerdo,
            id_deuda: idDeudaActual,
            fecha_cuota_origen: deudaOriginal.fecha_cuota_origen,
            fecha_vencimiento: deudaOriginal.fecha_vencimiento,
            fecha_movimiento: fechaSimulada,
            ciclo_mora: cicloMoraCalculado,
            escalon_mora: '1',
            tipo_movimiento: 'deuda',
            subtipo: 'recargo_1',
            id_origen: deudaOriginal.id_movimiento,
            concepto: 'recargo automático deuda 1',
            debe: String(recargo10),
            haber: '0',
            saldo: '0',
            id_pago: null,
            usuario: 'MotorMora'
          }

          const { error: errIns } = await supabase.from('movimientoscuenta_motor').insert([nuevoMovRecargo])
          if (errIns) {
            logs.push(`   ❌ Error al insertar recargo 1: ${errIns.message}`)
          } else {
            logs.push(`   ✅ Recargo 1 asentado correctamente como deuda en Supabase.`)
          }
          setLogResultados([...logs])
        }

        // REGLA 2: Escalones sucesivos (5% cada 10 días desde el último recargo)
        const movimientosRecargos = movimientosDeEstaDeuda.filter(m => m.subtipo?.startsWith('recargo_'))
        
        if (movimientosRecargos.length > 0) {
          movimientosRecargos.sort((a, b) => new Date(b.fecha_movimiento) - new Date(a.fecha_movimiento))
          const ultimoRecargo = movimientosRecargos[0]
          
          const fechaUltimoRecargoObj = new Date(ultimoRecargo.fecha_movimiento + 'T00:00:00')
          const diasDesdeUltimoRecargo = Math.floor((fechaTrabajo.getTime() - fechaUltimoRecargoObj.getTime()) / (1000 * 3600 * 24))

          logs.push(`   -> Días transcurridos desde el último recargo: ${diasDesdeUltimoRecargo}`)
          setLogResultados([...logs])

          if (diasDesdeUltimoRecargo >= 10 && maxEscalon < 5) {
            const siguienteEscalon = maxEscalon + 1
            const recargo5 = parseFloat((saldoDeuda * 0.05).toFixed(2))

            logs.push(`   ⚡ Aplicando RECARGO ${siguienteEscalon} (5% sobre saldo actual $${saldoDeuda}): $${recargo5}`)
            setLogResultados([...logs])

            const [anio, mes] = fechaSimulada.split('-')
            const cicloMoraCalculado = parseInt(`${anio}${mes}`, 10)

            const nuevoMovRecargoEscalon = {
              id_movimiento: siguienteIdMovimiento++,
              id_paciente: deudaOriginal.id_paciente,
              id_acuerdo: deudaOriginal.id_acuerdo,
              id_deuda: idDeudaActual,
              fecha_cuota_origen: deudaOriginal.fecha_cuota_origen,
              fecha_vencimiento: deudaOriginal.fecha_vencimiento,
              fecha_movimiento: fechaSimulada,
              ciclo_mora: cicloMoraCalculado,
              escalon_mora: String(siguienteEscalon),
              tipo_movimiento: 'deuda',
              subtipo: `recargo_${siguienteEscalon}`,
              id_origen: ultimoRecargo.id_movimiento,
              concepto: `recargo automático deuda ${siguienteEscalon}`,
              debe: String(recargo5),
              haber: '0',
              saldo: '0',
              id_pago: null,
              usuario: 'MotorMora'
            }

            const { error: errInsEsc } = await supabase.from('movimientoscuenta_motor').insert([nuevoMovRecargoEscalon])
            if (errInsEsc) {
              logs.push(`   ❌ Error al insertar recargo ${siguienteEscalon}: ${errInsEsc.message}`)
            } else {
              logs.push(`   ✅ Recargo ${siguienteEscalon} asentado correctamente como deuda en Supabase.`)
            }
            setLogResultados([...logs])
          }
        }
      }

      logs.push('✨ Proceso de motor de mora finalizado.')
      setLogResultados([...logs])
    } catch (err) {
      logs.push(`❌ Error crítico: ${err.message}`)
      setLogResultados([...logs])
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{ maxWidth: '800px', margin: '20px auto', padding: '25px', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', color: '#1e293b' }}>
      <h3 style={{ marginBottom: '15px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>
        🧪 Simulador de Motor de Mora (Prueba Limpia por Ejecución)
      </h3>
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px' }}>Fecha de Trabajo (Simulación):</label>
          <input 
            type="date" 
            value={fechaSimulada} 
            onChange={(e) => setFechaSimulada(e.target.value)}
            style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          />
        </div>
        <button 
          onClick={ejecutarMotorMora}
          disabled={cargando}
          style={{ marginTop: '18px', background: '#2563eb', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
        >
          {cargando ? 'Ejecutando...' : '▶ Ejecutar Motor de Mora'}
        </button>
      </div>

      {logResultados.length > 0 && (
        <div style={{ background: '#0f172a', color: '#e2e8f0', padding: '15px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '13px', maxHeight: '350px', overflowY: 'auto' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '10px', color: '#38bdf8', borderBottom: '1px solid #334155', paddingBottom: '5px' }}>
            📋 Log de la Ejecución Actual:
          </div>
          {logResultados.map((log, index) => (
            <div key={index} style={{ marginBottom: '4px', whiteSpace: 'pre-wrap' }}>
              {log}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}