import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

function EstadosCuenta() {
  const [datos, setDatos] = useState([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [detalleAcuerdos, setDetalleAcuerdos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [todosLosMovimientos, setTodosLosMovimientos] = useState([]);
  const [mapaPacientes, setMapaPacientes] = useState({});
  const [mapaPrestaciones, setMapaPrestaciones] = useState({});
  const [mapaAcuerdos, setMapaAcuerdos] = useState({});

  useEffect(() => {
    async function fetchData() {
      setCargando(true);
      try {
        // 1. Obtener todos los pacientes de pacientes_motor
        const { data: pacientes, error: errorPacientes } = await supabase
          .from('pacientes_motor')
          .select('id_paciente, nombre_apellido')
          .order('nombre_apellido', { ascending: true });
        
        if (errorPacientes) throw errorPacientes;

        // 2. Obtener todos los movimientos de movimientoscuenta_motor (paginado para evitar límite de 1000)
        let movements = [];
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
            movements = [...movements, ...data];
            if (data.length < 1000) {
              tieneMas = false;
            } else {
              epoch++;
            }
          }
        }
        setTodosLosMovimientos(movements);

        // 3. Obtener acuerdos y prestaciones para mapeo de nombres de acuerdos únicos
        const { data: acuerdos } = await supabase.from('acuerdos_motor').select('*');
        const { data: prestaciones } = await supabase.from('prestaciones_motor').select('*');

        const pacMap = {};
        pacientes.forEach(p => { pacMap[p.id_paciente] = p.nombre_apellido; });
        setMapaPacientes(pacMap);

        const prestMap = {};
        (prestaciones || []).forEach(p => { prestMap[p.id_prestacion] = p.nombre_prestacion; });
        setMapaPrestaciones(prestMap);

        const acMap = {};
        (acuerdos || []).forEach(a => { acMap[a.id_acuerdo] = a.id_prestacion; });
        setMapaAcuerdos(acMap);

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

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const balancesPorPaciente = {};
        pacientes.forEach(p => {
          balancesPorPaciente[p.id_paciente] = {
            id_paciente: p.id_paciente,
            nombre_paciente: p.nombre_apellido,
            vencido: 0,
            prox_7: 0,
            prox_15: 0,
            prox_30: 0,
            total: 0
          };
        });

        // Agrupar movimientos por paciente -> id_deuda para saldo consolidado por deuda
        const agrupado = {};
        movements.forEach(m => {
          if (!m.id_paciente || !m.id_deuda) return;
          const pId = m.id_paciente;
          const dId = m.id_deuda;
          if (!agrupado[pId]) agrupado[pId] = {};
          if (!agrupado[pId][dId]) {
            agrupado[pId][dId] = {
              fecha_vencimiento: m.fecha_vencimiento,
              debe: 0,
              haber: 0
            };
          }
          agrupado[pId][dId].debe += parsePlano(m.debe);
          agrupado[pId][dId].haber += parsePlano(m.haber);
        });

        // Distribuir deudas en las columnas temporales del dashboard
        for (const pId in agrupado) {
          const patientRow = balancesPorPaciente[pId];
          if (!patientRow) continue;

          for (const dId in agrupado[pId]) {
            const debt = agrupado[pId][dId];
            const saldo = debt.debe - debt.haber;

            if (saldo > 0.01) {
              if (!debt.fecha_vencimiento) {
                patientRow.vencido += saldo;
                patientRow.total += saldo;
                continue;
              }

              const [a, mesIndex, dia] = debt.fecha_vencimiento.split('-').map(Number);
              const fechaVenc = new Date(a, mesIndex - 1, dia);
              const diffTime = fechaVenc.getTime() - hoy.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

              if (diffDays < 0) {
                patientRow.vencido += saldo;
              } else if (diffDays <= 7) {
                patientRow.prox_7 += saldo;
              } else if (diffDays <= 15) {
                patientRow.prox_15 += saldo;
              } else if (diffDays <= 30) {
                patientRow.prox_30 += saldo;
              }
              patientRow.total += saldo;
            }
          }
        }

        // Mostrar solo pacientes con deuda activa en el resumen gerencial, ordenados alfabéticamente
        const arrayFinal = Object.values(balancesPorPaciente)
          .filter(p => p.total > 0.01)
          .sort((a, b) => a.nombre_paciente.localeCompare(b.nombre_paciente));
        setDatos(arrayFinal);

      } catch (err) {
        console.error("Error al inicializar EstadosCuenta:", err);
      } finally {
        setCargando(false);
      }
    }
    fetchData();
  }, []);

  const verDetalle = (idPaciente, nombrePaciente) => {
    setCargando(true);
    setPacienteSeleccionado(nombrePaciente);
    setDetalleAcuerdos([]);

    const movsPaciente = todosLosMovimientos.filter(m => m.id_paciente === idPaciente);

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

    const deudasMap = {};
    movsPaciente.forEach(m => {
      if (!m.id_deuda) return;
      const dId = String(m.id_deuda);
      if (!deudasMap[dId]) {
        deudasMap[dId] = {
          concepto: m.concepto,
          subtipo: m.subtipo,
          id_acuerdo: m.id_acuerdo,
          debe: 0,
          haber: 0
        };
      }
      deudasMap[dId].debe += parsePlano(m.debe);
      deudasMap[dId].haber += parsePlano(m.haber);
    });

    const resumen = [];
    for (const dId in deudasMap) {
      const debt = deudasMap[dId];
      const saldo = debt.debe - debt.haber;

      if (saldo > 0.01) {
        let nombreParaMostrar = debt.concepto || `Deuda #${dId}`;

        if ((debt.subtipo || '').toUpperCase() === 'ACUERDO_UNICO' && debt.id_acuerdo) {
          const idPrestacion = mapaAcuerdos[debt.id_acuerdo];
          const nombrePrestacion = mapaPrestaciones[idPrestacion];
          if (nombrePrestacion) {
            nombreParaMostrar = nombrePrestacion;
          }
        }

        resumen.push({
          concepto: nombreParaMostrar,
          saldo: saldo
        });
      }
    }

    setDetalleAcuerdos(resumen);
    setCargando(false);
  };

  return (
    <div style={{ padding: '20px', color: 'white', fontFamily: 'Arial' }}>
      <h1>Estados de Cuenta (Gerencial)</h1>
      
      {cargando && datos.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#00d4ff' }}>Cargando información gerencial...</div>
      ) : (
        <table border="1" style={{ width: '100%', borderCollapse: 'collapse', borderColor: '#555', marginTop: '20px' }}>
          <thead style={{ backgroundColor: '#444' }}>
            <tr>
              <th style={{padding: '10px', textAlign: 'left'}}>PACIENTE</th>
              <th style={{padding: '10px'}}>VENCIDO</th>
              <th style={{padding: '10px'}}>PROX 7</th>
              <th style={{padding: '10px'}}>PROX 15</th>
              <th style={{padding: '10px'}}>PROX 30</th>
              <th style={{padding: '10px'}}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {datos.map((p) => (
              <tr key={p.id_paciente}>
                <td onClick={() => verDetalle(p.id_paciente, p.nombre_paciente)} 
                    style={{cursor: 'pointer', textDecoration: 'underline', padding: '10px', color: '#00d4ff'}}>
                  {p.nombre_paciente}
                </td>
                <td style={{padding: '10px', textAlign: 'right'}}>${p.vencido.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{padding: '10px', textAlign: 'right'}}>${p.prox_7.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{padding: '10px', textAlign: 'right'}}>${p.prox_15.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{padding: '10px', textAlign: 'right'}}>${p.prox_30.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{padding: '10px', textAlign: 'right'}}>
                  <strong>${p.total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pacienteSeleccionado && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#222', padding: '25px', borderRadius: '8px', width: '600px', color: 'white' }}>
            <h2 style={{marginTop: 0}}>Detalle: {pacienteSeleccionado}</h2>
            
            {cargando ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#00d4ff' }}>Cargando información...</div>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {detalleAcuerdos.length > 0 ? detalleAcuerdos.map((d, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #444' }}>
                        <td style={{ padding: '10px' }}>{d.concepto}</td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>${d.saldo.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    )) : <tr><td colSpan="2" style={{padding: '20px', textAlign: 'center'}}>No hay deudas activas.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            
            <button onClick={() => setPacienteSeleccionado(null)} 
                    style={{marginTop: '20px', padding: '10px 20px', cursor: 'pointer', backgroundColor: '#555', color: 'white', border: 'none', borderRadius: '4px'}}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default EstadosCuenta;