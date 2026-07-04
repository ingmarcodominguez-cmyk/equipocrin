import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

function EstadosCuenta() {
  const [datos, setDatos] = useState([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [detalleAcuerdos, setDetalleAcuerdos] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase
        .from('data_gerencial')
        .select('*')
        .order('PACIENTE', { ascending: true });
      
      if (error) console.error("Error al cargar data gerencial:", error);
      else setDatos(data || []);
    }
    fetchData();
  }, []);

  const verDetalle = async (idPaciente, nombrePaciente) => {
    setCargando(true);
    setPacienteSeleccionado(nombrePaciente);
    setDetalleAcuerdos([]);

    const { data: movimientos } = await supabase
      .from('movimientos')
      .select('id_deuda, id_acuerdo, concepto, debe, haber')
      .eq('id_paciente_excel', idPaciente);

    if (!movimientos) {
      setCargando(false);
      return;
    }

    const conceptosPorDeuda = {};
    movimientos.forEach(mov => {
      if (mov.id_deuda && mov.id_deuda !== 0 && mov.debe > 0) {
        conceptosPorDeuda[mov.id_deuda] = mov.concepto;
      }
    });

    const resumen = {};

    for (const mov of movimientos) {
      if (!mov.id_deuda || mov.id_deuda === 0) continue;

      const clave = mov.id_deuda;
      let nombreParaMostrar = conceptosPorDeuda[clave] || mov.concepto;

      if (nombreParaMostrar === "Acuerdo único" && mov.id_acuerdo) {
        const { data: acuerdoData } = await supabase
          .from('acuerdos')
          .select('id_prestacion')
          .eq('id_acuerdo', mov.id_acuerdo)
          .single();

        if (acuerdoData?.id_prestacion) {
          const { data: prestacionData } = await supabase
            .from('prestaciones')
            .select('nombre_prestacion')
            .eq('id_prestacion', acuerdoData.id_prestacion)
            .single();

          if (prestacionData?.nombre_prestacion) {
            nombreParaMostrar = prestacionData.nombre_prestacion;
          }
        }
      }

      if (!resumen[clave]) {
        resumen[clave] = { concepto: nombreParaMostrar, saldo: 0 };
      }
      resumen[clave].saldo += (mov.debe - mov.haber);
    }

    const arrayFinal = Object.values(resumen).filter(item => Math.abs(item.saldo) > 0.01);
    
    setDetalleAcuerdos(arrayFinal);
    setCargando(false);
  };

  return (
    <div style={{ padding: '20px', color: 'white', fontFamily: 'Arial' }}>
      <h1>Cuenta Corriente</h1>
      
      {/* Tabla Principal con todas las columnas */}
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
            <tr key={p.ID_PACIENTE}>
              <td onClick={() => verDetalle(p.ID_PACIENTE, p.PACIENTE)} 
                  style={{cursor: 'pointer', textDecoration: 'underline', padding: '10px', color: '#00d4ff'}}>
                {p.PACIENTE}
              </td>
              <td style={{padding: '10px', textAlign: 'right'}}>${(p.VENCIDO || 0).toLocaleString()}</td>
              <td style={{padding: '10px', textAlign: 'right'}}>${(p.PROX_7 || 0).toLocaleString()}</td>
              <td style={{padding: '10px', textAlign: 'right'}}>${(p.PROX_15 || 0).toLocaleString()}</td>
              <td style={{padding: '10px', textAlign: 'right'}}>${(p.PROX_30 || 0).toLocaleString()}</td>
              <td style={{padding: '10px', textAlign: 'right'}}>
                <strong>${(p.VENCIDO + p.PROX_7 + p.PROX_15 + p.PROX_30).toLocaleString()}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal de Detalle */}
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
                        <td style={{ padding: '10px', textAlign: 'right' }}>${d.saldo.toLocaleString()}</td>
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