import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function EstadosCuenta({ onVolver }) {
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [filtroNombre, setFiltroNombre] = useState('');
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [detalleAcuerdos, setDetalleAcuerdos] = useState([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

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

        // Mostrar todos los pacientes ordenados alfabéticamente
        const arrayFinal = Object.values(balancesPorPaciente)
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
    setCargandoDetalle(true);
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
    setCargandoDetalle(false);
  };

  // Filtrado de pacientes
  const datosFiltrados = datos.filter(p => 
    (p.nombre_paciente || '').toLowerCase().includes(filtroNombre.toLowerCase())
  );

  // Totales generales para las tarjetas métricas (KPIs)
  const sumaVencido = datosFiltrados.reduce((acc, p) => acc + p.vencido, 0);
  const sumaProx7 = datosFiltrados.reduce((acc, p) => acc + p.prox_7, 0);
  const sumaProx15 = datosFiltrados.reduce((acc, p) => acc + p.prox_15, 0);
  const sumaProx30 = datosFiltrados.reduce((acc, p) => acc + p.prox_30, 0);
  const sumaTotal = datosFiltrados.reduce((acc, p) => acc + p.total, 0);

  // Descarga de datos a Excel
  const descargarExcel = () => {
    let csvContent = "\uFEFF"; // UTF-8 BOM
    csvContent += "sep=;\n";
    csvContent += "Reporte Gerencial - Estado Financiero de Pacientes\n\n";
    csvContent += "Paciente;Vencido;Próx 7 Días;Próx 15 Días;Próx 30 Días;Total Deuda\n";

    datosFiltrados.forEach(p => {
      const vencidoStr = p.vencido.toFixed(2).replace('.', ',');
      const prox7Str = p.prox_7.toFixed(2).replace('.', ',');
      const prox15Str = p.prox_15.toFixed(2).replace('.', ',');
      const prox30Str = p.prox_30.toFixed(2).replace('.', ',');
      const totalStr = p.total.toFixed(2).replace('.', ',');
      
      csvContent += `${p.nombre_paciente};${vencidoStr};${prox7Str};${prox15Str};${prox30Str};${totalStr}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Estado_Financiero_Pacientes.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', fontFamily: 'Segoe UI, system-ui, sans-serif', color: '#1e293b' }}>
      
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '18px', marginBottom: '25px' }}>
        <div>
          <h2 style={{ color: '#0f172a', margin: 0, fontSize: '22px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📊 Estado Financiero de Pacientes
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Análisis gerencial y consolidado de saldos deudores agrupados por vencimiento.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={descargarExcel}
            disabled={datosFiltrados.length === 0}
            style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.2s' }}
            onMouseOver={(e) => e.target.style.background = '#059669'}
            onMouseOut={(e) => e.target.style.background = '#10b981'}
          >
            📥 Descargar Excel
          </button>
          <button
            onClick={onVolver}
            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569', transition: 'background 0.2s' }}
            onMouseOver={(e) => e.target.style.background = '#e2e8f0'}
            onMouseOut={(e) => e.target.style.background = '#f1f5f9'}
          >
            ← Volver al Menú
          </button>
        </div>
      </div>

      {/* Tarjetas de Balance Global (KPIs) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '15px', marginBottom: '25px' }}>
        <div style={{ padding: '15px', borderRadius: '12px', background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', border: '1px solid #fca5a5' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#b91c1c', textTransform: 'uppercase' }}>Vencido</span>
          <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#991b1b', margin: '4px 0 0 0' }}>
            ${sumaVencido.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
        </div>
        <div style={{ padding: '15px', borderRadius: '12px', background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '1px solid #fcd34d' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#d97706', textTransform: 'uppercase' }}>Próx 7 Días</span>
          <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#b45309', margin: '4px 0 0 0' }}>
            ${sumaProx7.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
        </div>
        <div style={{ padding: '15px', borderRadius: '12px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', border: '1px solid #93c5fd' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#2563eb', textTransform: 'uppercase' }}>Próx 15 Días</span>
          <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#1e40af', margin: '4px 0 0 0' }}>
            ${sumaProx15.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
        </div>
        <div style={{ padding: '15px', borderRadius: '12px', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #86efac' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#16a34a', textTransform: 'uppercase' }}>Próx 30 Días</span>
          <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#15803d', margin: '4px 0 0 0' }}>
            ${sumaProx30.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
        </div>
        <div style={{ padding: '15px', borderRadius: '12px', background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)', border: '1px solid #d8b4fe' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#7c3aed', textTransform: 'uppercase' }}>Total Cartera</span>
          <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#6d28d9', margin: '4px 0 0 0' }}>
            ${sumaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
        </div>
      </div>

      {/* Controles de Búsqueda */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            placeholder="🔍 Buscar paciente por nombre..."
            value={filtroNombre}
            onChange={(e) => setFiltroNombre(e.target.value)}
            style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Listado y Tabla */}
      {cargando ? (
        <p style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', padding: '40px' }}>Cargando información consolidada...</p>
      ) : datosFiltrados.length === 0 ? (
        <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '30px', borderRadius: '12px', textAlign: 'center' }}>
          No se encontraron registros de deuda para los filtros seleccionados.
        </p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '12px 10px' }}>Paciente</th>
                <th style={{ padding: '12px 10px', textAlign: 'right' }}>Vencido ($)</th>
                <th style={{ padding: '12px 10px', textAlign: 'right' }}>Próx 7 Días ($)</th>
                <th style={{ padding: '12px 10px', textAlign: 'right' }}>Próx 15 Días ($)</th>
                <th style={{ padding: '12px 10px', textAlign: 'right' }}>Próx 30 Días ($)</th>
                <th style={{ padding: '12px 10px', textAlign: 'right' }}>Total Deuda ($)</th>
              </tr>
            </thead>
            <tbody>
              {datosFiltrados.map((p) => (
                <tr key={p.id_paciente} style={{ borderBottom: '1px solid #e2e8f0', background: p.total > 0.01 ? '#fff' : '#f8fafc' }}>
                  <td style={{ padding: '12px 10px' }}>
                    <button
                      onClick={() => verDetalle(p.id_paciente, p.nombre_paciente)}
                      style={{ background: 'none', border: 'none', padding: 0, color: '#2563eb', fontWeight: 'bold', cursor: 'pointer', textAlign: 'left', textDecoration: 'underline', fontSize: '13px' }}
                    >
                      👤 {p.nombre_paciente}
                    </button>
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', color: p.vencido > 0 ? '#dc2626' : '#64748b', fontWeight: p.vencido > 0 ? '600' : 'normal' }}>
                    ${p.vencido.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', color: p.prox_7 > 0 ? '#d97706' : '#64748b', fontWeight: p.prox_7 > 0 ? '600' : 'normal' }}>
                    ${p.prox_7.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', color: p.prox_15 > 0 ? '#2563eb' : '#64748b' }}>
                    ${p.prox_15.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', color: p.prox_30 > 0 ? '#16a34a' : '#64748b' }}>
                    ${p.prox_30.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', color: p.total > 0 ? '#0f172a' : '#94a3b8' }}>
                    ${p.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Detalle */}
      {pacienteSeleccionado && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '600px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: 'bold' }}>
                📋 Composición de Deuda: {pacienteSeleccionado}
              </h3>
              <button onClick={() => setPacienteSeleccionado(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>

            {cargandoDetalle ? (
              <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Cargando detalle...</p>
            ) : (
              <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #edf2f7', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '10px' }}>Concepto</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Saldo Pendiente ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalleAcuerdos.length > 0 ? (
                      detalleAcuerdos.map((d, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px', color: '#334155' }}>{d.concepto}</td>
                          <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#b91c1c' }}>
                            ${d.saldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="2" style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                          No registra deudas pendientes.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                onClick={() => setPacienteSeleccionado(null)}
                style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}