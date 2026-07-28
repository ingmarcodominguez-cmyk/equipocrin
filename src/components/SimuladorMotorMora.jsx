import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function SimuladorMotorMora() {
  const [fechaSimulada, setFechaSimulada] = useState(new Date().toISOString().split('T')[0])
  const [cargando, setCargando] = useState(false)
  const [logResultados, setLogResultados] = useState([])

  async function ejecutarMotorMora() {
    setCargando(true)
    const logs = []
    logs.push(`🚀 Iniciando proceso de mora con fecha de trabajo: ${fechaSimulada}`)
    setLogResultados(logs)

    const parsePlano = (val) => {
      if (val === null || val === undefined || val === '') return 0;
      if (typeof val === 'number') return val;
      const valStr = String(val).trim();
      if (valStr.includes(',')) {
        const clean = valStr.replace(/\./g, '').replace(',', '.');
        const res = parseFloat(clean);
        return isNaN(res) ? 0 : res;
      }
      const res = parseFloat(valStr);
      return isNaN(res) ? 0 : res;
    };

    try {
      let todosLosMovimientos = [];
      let epoch = 0;
      let tieneMas = true;
      while (tieneMas) {
        const { data, error } = await supabase
          .from('movimientoscuenta_motor')
          .select('*')
          .range(epoch * 1000, (epoch + 1) * 1000 - 1)
          .order('id_movimiento', { ascending: true });

        if (error) throw error;
        if (!data || data.length === 0) {
          tieneMas = false;
        } else {
          todosLosMovimientos = [...todosLosMovimientos, ...data];
          if (data.length < 1000) {
            tieneMas = false;
          } else {
            epoch++;
          }
        }
      }

      if (todosLosMovimientos.length === 0) {
        logs.push('ℹ️ No se encontraron movimientos en la tabla.')
        setLogResultados([...logs])
        setCargando(false)
        return
      }

      // REGLA: Filtrar ÚNICAMENTE cuotas mensuales. Los 'acuerdo_unico' (incluyendo evaluaciones) se ignoran por completo.
      const deudasBase = todosLosMovimientos.filter(m => (m.subtipo || '').toUpperCase() === 'CUOTA_MENSUAL')

      logs.push(`🔍 Se encontraron ${deudasBase.length} registros de cuotas mensuales base para evaluar (los acuerdos únicos quedan excluidos del motor).`)
      setLogResultados([...logs])

      const fechaTrabajo = new Date(fechaSimulada + 'T00:00:00')

      const { data: ultMov } = await supabase
        .from('movimientoscuenta_motor')
        .select('id_movimiento')
        .order('id_movimiento', { ascending: false })
        .limit(1)

      let siguienteIdMovimiento = (ultMov && ultMov.length > 0) ? (ultMov[0].id_movimiento || 0) + 1 : 1

      // Traer todos los acuerdos para mapear admite_recargo
      const { data: acuerdosData, error: errorAcuerdos } = await supabase
        .from('acuerdos_motor')
        .select('id_acuerdo, admite_recargo');

      if (errorAcuerdos) throw errorAcuerdos;

      const mapaAdmiteRecargo = {};
      (acuerdosData || []).forEach(ac => {
        mapaAdmiteRecargo[ac.id_acuerdo] = ac.admite_recargo;
      });

      for (const deudaOriginal of deudasBase) {
        const idDeudaActual = deudaOriginal.id_deuda || deudaOriginal.id_movimiento
        const fechaVencStr = deudaOriginal.fecha_vencimiento

        // Verificar si la cuenta/acuerdo admite recargo
        const idAcuerdo = deudaOriginal.id_acuerdo;
        if (idAcuerdo) {
          const admite = mapaAdmiteRecargo[idAcuerdo];
          if (admite && String(admite).toUpperCase() === 'NO') {
            logs.push(`   -> Cuota ID ${idDeudaActual} (Acuerdo #${idAcuerdo}) no admite recargo por configuración. Omitiendo.`)
            setLogResultados([...logs])
            continue;
          }
        }

        if (!fechaVencStr) {
          logs.push(`   -> Cuota ID ${idDeudaActual} sin fecha de vencimiento. Omitiendo.`)
          setLogResultados([...logs])
          continue
        }

        const movimientosDeEstaDeuda = todosLosMovimientos.filter(m => (m.id_deuda || m.id_movimiento) === idDeudaActual)

        const totalDebe = movimientosDeEstaDeuda.reduce((acc, m) => acc + parsePlano(m.debe), 0)
        const totalHaber = movimientosDeEstaDeuda.reduce((acc, m) => acc + parsePlano(m.haber), 0)
        const saldoDeuda = totalDebe - totalHaber

        logs.push(`--- ID Deuda: ${idDeudaActual} | Vencimiento: ${fechaVencStr} | Saldo Actual: $${saldoDeuda} ---`)
        setLogResultados([...logs])

        if (saldoDeuda <= 0) {
          logs.push(`   -> La cuota está totalmente saldada (Saldo: $${saldoDeuda}). Sin acciones.`)
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
          continue;
        }

        const escalonesAplicados = movimientosDeEstaDeuda
          .filter(m => {
            const sub = (m.subtipo || '').toUpperCase();
            return sub.startsWith('RECARGO_') || sub === 'RECARGO_MORA' || (m.concepto || '').toUpperCase().includes('RECARGO');
          })
          .map(m => {
            const sub = (m.subtipo || '').toUpperCase();
            const conc = (m.concepto || '').toUpperCase();
            if (sub === 'RECARGO_MORA' || conc.includes('RECARGO')) {
              if (conc.includes('(2)') || conc.includes('ESCALÓN (2)')) return 2;
              if (conc.includes('(3)') || conc.includes('ESCALÓN (3)')) return 3;
              if (conc.includes('(4)') || conc.includes('ESCALÓN (4)')) return 4;
              if (conc.includes('(5)') || conc.includes('ESCALÓN (5)')) return 5;
              if (conc.includes('10%') || conc.includes('MORA')) return 1;
              return parseInt(m.escalon_mora || '1', 10);
            }
            const match = sub.match(/RECARGO_(\d+)/);
            return match ? parseInt(match[1], 10) : parseInt(m.escalon_mora || '0', 10);
          })
          .filter(e => !isNaN(e) && e > 0);

        const maxEscalon = escalonesAplicados.length > 0 ? Math.max(...escalonesAplicados) : 0
        logs.push(`   -> Escalón de mora actual máximo: ${maxEscalon}`)
        setLogResultados([...logs])

        let fechaUltimoRecargo = null;
        const movimientosRecargos = movimientosDeEstaDeuda.filter(m => {
          const sub = (m.subtipo || '').toUpperCase();
          const conc = (m.concepto || '').toUpperCase();
          return sub.startsWith('RECARGO') || conc.includes('RECARGO');
        });
        if (movimientosRecargos.length > 0) {
          movimientosRecargos.sort((a, b) => {
            const dateA = new Date((a.fecha_movimiento || '2000-01-01') + 'T00:00:00');
            const dateB = new Date((b.fecha_movimiento || '2000-01-01') + 'T00:00:00');
            return dateB - dateA;
          });
          fechaUltimoRecargo = movimientosRecargos[0].fecha_movimiento;
        }

        // Si ya se aplicó un recargo hoy para esta deuda, evitamos duplicados en el mismo día
        if (fechaUltimoRecargo === fechaSimulada) {
          logs.push(`   -> Ya se aplicó un recargo hoy para esta deuda.`)
          setLogResultados([...logs])
          continue;
        }

        let startNro = 0;
        let countNew = 0;
        let diasDesdeUltimo = 0;

        if (maxEscalon === 0) {
          if (diasAtraso >= 10) {
            startNro = 1;
            countNew = 1 + Math.floor((diasAtraso - 10) / 10);
          }
        } else {
          if (fechaUltimoRecargo) {
            const dateUltimo = new Date(fechaUltimoRecargo + 'T00:00:00');
            diasDesdeUltimo = Math.floor((fechaTrabajo.getTime() - dateUltimo.getTime()) / (1000 * 60 * 60 * 24));
            logs.push(`   -> Días transcurridos desde el último recargo: ${diasDesdeUltimo}`);
            setLogResultados([...logs]);
            if (diasDesdeUltimo >= 10) {
              startNro = maxEscalon + 1;
              countNew = Math.floor(diasDesdeUltimo / 10);
            }
          } else {
            startNro = maxEscalon + 1;
            const expectedTotal = 1 + Math.floor((diasAtraso - 10) / 10);
            if (expectedTotal > maxEscalon) {
              countNew = expectedTotal - maxEscalon;
            }
          }
        }

        if (countNew <= 0) {
          logs.push(`   -> No corresponde aplicar nuevos recargos en esta corrida.`);
          setLogResultados([...logs]);
          continue;
        }

        let saldoAcumuladoActual = saldoDeuda;
        const importeCuotaBase = parsePlano(deudaOriginal.debe);

        for (let idx = 0; idx < countNew; idx++) {
          const nroRecargo = startNro + idx;
          const porcentaje = (nroRecargo === 1) ? 0.10 : 0.05;
          const label = (nroRecargo === 1) ? 'Recargo por mora (10%)' : `Recargo por mora escalón (${nroRecargo})`;

          if (saldoAcumuladoActual <= 0) break;

          let baseCalculo = (nroRecargo === 1) ? importeCuotaBase : saldoAcumuladoActual;
          const montoRecargo = Math.round((baseCalculo * porcentaje) * 100) / 100;

          logs.push(`   ⚡ Simulando RECARGO ${nroRecargo} (${porcentaje * 100}% sobre base $${baseCalculo}): $${montoRecargo}`);
          setLogResultados([...logs]);

          const [anio, mes] = fechaSimulada.split('-');
          const cicloMoraCalculado = parseInt(`${anio}${mes}`, 10);

          const nuevoMovRecargo = {
            id_movimiento: siguienteIdMovimiento++,
            id_paciente: deudaOriginal.id_paciente,
            id_acuerdo: deudaOriginal.id_acuerdo,
            id_deuda: idDeudaActual,
            fecha_cuota_origen: deudaOriginal.fecha_cuota_origen,
            fecha_vencimiento: deudaOriginal.fecha_vencimiento,
            fecha_movimiento: fechaSimulada,
            ciclo_mora: cicloMoraCalculado,
            escalon_mora: String(nroRecargo),
            tipo_movimiento: 'deuda',
            subtipo: `RECARGO_${nroRecargo}`,
            id_origen: (movimientosRecargos.length > 0) ? movimientosRecargos[0].id_movimiento : deudaOriginal.id_movimiento,
            concepto: label,
            debe: String(montoRecargo),
            haber: '0',
            saldo: '0',
            id_pago: null,
            usuario: 'MotorMora'
          };

          const { error: errIns } = await supabase.from('movimientoscuenta_motor').insert([nuevoMovRecargo]);
          if (errIns) {
            logs.push(`   ❌ Error al insertar recargo ${nroRecargo}: ${errIns.message}`);
          } else {
            logs.push(`   ✅ Recargo ${nroRecargo} asentado correctamente en Supabase.`);
            saldoAcumuladoActual += montoRecargo;
          }
          setLogResultados([...logs]);
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
        🧪 Simulador de Motor de Mora (Excluyendo Acuerdos Únicos)
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