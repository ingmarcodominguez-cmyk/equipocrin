
import { useEffect, useState }
from 'react'

import { supabase }
from '../lib/supabase.js'

function AgendaMensual() {

  const [turnos, setTurnos] =
    useState([])

  const [users, setUsers] =
    useState([])

  
const [
  mesActual,
  setMesActual
] = useState(new Date())



  const [
    diaSeleccionado,
    setDiaSeleccionado
  ] = useState(null)

  const [
    turnoEditando,
    setTurnoEditando
  ] = useState(null)

  const [
    profesionalFiltro,
    setProfesionalFiltro
  ] = useState('todos')

  const [
    busquedaPaciente,
    setBusquedaPaciente
  ] = useState('')

  const [
    nuevoPaciente,
    setNuevoPaciente
  ] = useState('')

  const [
    nuevoProfesional,
    setNuevoProfesional
  ] = useState('')

  const [
    nuevoTipo,
    setNuevoTipo
  ] = useState('primera_vez')

  const [
    nuevaHora,
    setNuevaHora
  ] = useState('08:00')

  const [
    nuevasObservaciones,
    setNuevasObservaciones
  ] = useState('')

  const [
    editPaciente,
    setEditPaciente
  ] = useState('')

  const [
    editFecha,
    setEditFecha
  ] = useState('')

  const [
    editHora,
    setEditHora
  ] = useState('08:00')

  const [
    editTipo,
    setEditTipo
  ] = useState('')

  const [
    editObs,
    setEditObs
  ] = useState('')

  useEffect(() => {

    cargarTurnos()
    cargarUsuarios()

  }, [])

  async function cargarTurnos() {

    const { data } =
      await supabase

        .from('turnos')

        .select('*')

        .order(
          'fecha_inicio',
          {
            ascending: true
          }
        )

    if (data) {

      setTurnos(data)
    }
  }

  async function cargarUsuarios() {

    const { data } =
      await supabase

        .from('users')

        .select('*')

    if (data) {

      setUsers(data)
    }
  }

  function hora24(
    fecha
  ) {

    if (!fecha) return ''

    return fecha
      .split('T')[1]
      ?.substring(0, 5)
  }

  function fechaLatina(
    fecha
  ) {

    if (!fecha) return ''

    const partes =

      fecha
        .split('T')[0]
        .split('-')

    return `${partes[2]}/${partes[1]}/${partes[0]}`
  }

  function obtenerNombreProfesional(
    id
  ) {

    return users.find(
      (u) => u.id == id
    )?.nombre || ''
  }

  function colorEstado(
    estado
  ) {

    if (estado === 'realizado')
      return '#d4edda'

    if (estado === 'cancelado')
      return '#f8d7da'

    return '#ffffff'
  }

  const año =
    mesActual.getFullYear()

  const mes =
    mesActual.getMonth()

  const primerDia =

    new Date(
      año,
      mes,
      1
    ).getDay()

  const diasMes =

    new Date(
      año,
      mes + 1,
      0
    ).getDate()

  const dias = []

  for (
    let i = 0;
    i < primerDia;
    i++
  ) {

    dias.push(null)
  }

  for (
    let dia = 1;
    dia <= diasMes;
    dia++
  ) {

    dias.push(dia)
  }

  const nombresDias = [

    'Dom',
    'Lun',
    'Mar',
    'Mié',
    'Jue',
    'Vie',
    'Sáb'
  ]

  
const nombresMeses = [

  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
]


  function editarTurno(
    turno
  ) {

    setTurnoEditando(
      turno
    )

    setEditPaciente(
      turno.paciente_nombre
    )

    setEditFecha(

      turno.fecha_inicio
        .split('T')[0]
    )

    setEditHora(

      turno.fecha_inicio
        .split('T')[1]
        .substring(0, 5)
    )

    setEditTipo(
      turno.tipo_turno
    )

    setEditObs(
      turno.observaciones || ''
    )
  }

  async function guardarEdicion() {

    const fechaCompleta =

      `${editFecha}T${editHora}:00`

    await supabase

      .from('turnos')

      .update({

        paciente_nombre:
          editPaciente,

        fecha_inicio:
          fechaCompleta,

        tipo_turno:
          editTipo,

        observaciones:
          editObs
      })

      .eq(
        'id',
        turnoEditando.id
      )

    cargarTurnos()

    setTurnoEditando(
      null
    )
  }

  async function cambiarEstadoTurno(
    id,
    estado
  ) {

    await supabase

      .from('turnos')

      .update({
        estado
      })

      .eq(
        'id',
        id
      )

    cargarTurnos()

    setTurnoEditando(
      null
    )
  }

  async function crearTurnoDesdeCalendario() {

    const fechaTexto =

      `${año}-${String(
        mes + 1
      ).padStart(
        2,
        '0'
      )}-${String(
        diaSeleccionado.dia
      ).padStart(
        2,
        '0'
      )}`

    const fechaCompleta =

      `${fechaTexto}T${nuevaHora}:00`

    const { data: existentes } =
      await supabase

        .from('turnos')

        .select('*')

        .eq(
          'profesional_id',
          nuevoProfesional
        )

        .eq(
          'fecha_inicio',
          fechaCompleta
        )

        .eq(
          'estado',
          'agendado'
        )

    if (
      existentes &&
      existentes.length > 0
    ) {

      alert(
        'Ese profesional ya tiene un turno en ese horario'
      )

      return
    }

    await supabase

      .from('turnos')

      .insert([
        {

          paciente_nombre:
            nuevoPaciente,

          profesional_id:
            nuevoProfesional,

          tipo_turno:
            nuevoTipo,

          fecha_inicio:
            fechaCompleta,

          observaciones:
            nuevasObservaciones,

          estado:
            'agendado'
        }
      ])

    cargarTurnos()

    setNuevoPaciente('')
    setNuevoProfesional('')
    setNuevoTipo('primera_vez')
    setNuevaHora('08:00')
    setNuevasObservaciones('')

    setDiaSeleccionado(
      null
    )
  }

  return (

    <div
      style={{
        padding: 10
      }}
    >

      
<div

  style={{

    display: 'flex',

    alignItems: 'center',

    gap: 20,

    marginBottom: 20
  }}
>

  <button

    onClick={() =>

      setMesActual(

        new Date(
          año,
          mes - 1,
          1
        )
      )
    }
  >

    ←

  </button>

  <h1>

    {

      nombresMeses[mes]

    }

    {' '}

    {año}

  </h1>

  <button

    onClick={() =>

      setMesActual(

        new Date(
          año,
          mes + 1,
          1
        )
      )
    }
  >

    →

  </button>

</div>



      <div

        style={{

          display: 'flex',

          gap: 10,

          marginBottom: 20,

          flexWrap: 'wrap'
        }}
      >

        <input

          placeholder=
            "Buscar paciente"

          value={busquedaPaciente}

          onChange={(e) =>
            setBusquedaPaciente(
              e.target.value
            )
          }
        />

        <select

          value={profesionalFiltro}

          onChange={(e) =>
            setProfesionalFiltro(
              e.target.value
            )
          }
        >

          <option value="todos">
            Todos
          </option>

          {

            users.map(
              (u) => (

                <option

                  key={u.id}

                  value={u.id}
                >

                  {u.nombre}

                </option>
              )
            )
          }

        </select>

      </div>

      <div

        style={{

          display: 'grid',

          gridTemplateColumns:
            'repeat(7,1fr)',

          gap: 10
        }}
      >

        {

          nombresDias.map(
            (d) => (

              <div

                key={d}

                style={{

                  textAlign:
                    'center',

                  fontWeight:
                    'bold'
                }}
              >

                {d}

              </div>
            )
          )
        }

        {

          dias.map(
            (dia, index) => {

              if (!dia) {

                return (
                  <div
                    key={index}
                  />
                )
              }


              
const hoy = new Date()

const esHoy =

  hoy.getDate() === dia

  &&

  hoy.getMonth() === mes

  &&

  hoy.getFullYear() === año


              const fechaTexto =

                `${año}-${String(
                  mes + 1
                ).padStart(
                  2,
                  '0'
                )}-${String(
                  dia
                ).padStart(
                  2,
                  '0'
                )}`

              const turnosDia =

                turnos.filter(
                  (t) => {

                    if (

                      !t.fecha_inicio
                        .startsWith(
                          fechaTexto
                        )
                    ) {

                      return false
                    }

                    if (

                      profesionalFiltro !==
                        'todos'

                      &&

                      t.profesional_id !=
                        profesionalFiltro
                    ) {

                      return false
                    }

                    if (

                      busquedaPaciente &&
                      !

                      t
                        .paciente_nombre

                        .toLowerCase()

                        .includes(

                          busquedaPaciente
                            .toLowerCase()
                        )
                    ) {

                      return false
                    }

                    return true
                  }
                )

              return (

                <div

                  key={dia}

                  onClick={() => {

                    setDiaSeleccionado(
                      { dia }
                    )
                  }}

                  style={{

                  
border:

  esHoy

    ? '3px solid #0d6efd'

    : '1px solid #ccc',


                    borderRadius: 10,

                    minHeight: 120,

                    padding: 8,

                    
backgroundColor:

  esHoy

    ? '#e7f1ff'

    : '#f8f8f8',



                    cursor:
                      'pointer'
                  }}
                >

                  
<div

  style={{

    display: 'flex',

    justifyContent:
      'space-between',

    alignItems:
      'center'
  }}
>

  <strong>
    {dia}
  </strong>

  {

    turnosDia.length > 0 && (

      <span

        style={{

          backgroundColor:
            '#0d6efd',

          color:
            'white',

          borderRadius:
            '50%',

          width: 24,

          height: 24,

          display: 'flex',

          justifyContent:
            'center',

          alignItems:
            'center',

          fontSize: 12,

          fontWeight:
            'bold'
        }}
      >

        {turnosDia.length}

      </span>
    )
  }

</div>



                  {

                    turnosDia.map(
                      (turno) => (

                        <div

                          key={turno.id}

                          onClick={(e) => {

                            e.stopPropagation()

                            editarTurno(
                              turno
                            )
                          }}

                          style={{

                            marginTop: 6,

                            padding: 6,

                            borderRadius: 6,

                            backgroundColor:
                              colorEstado(
                                turno.estado
                              ),

                            fontSize: 12
                          }}
                        >

                          <strong>

                            {
                              hora24(
                                turno.fecha_inicio
                              )
                            }

                          </strong>

                          <br />

                          {
                            turno.paciente_nombre
                          }

                          <br />

                          <small>

                            {
                              obtenerNombreProfesional(
                                turno.profesional_id
                              )
                            }

                          </small>

                        </div>
                      )
                    )
                  }

                </div>
              )
            }
          )
        }

      </div>

      {

        diaSeleccionado && (

          <div

            style={{

              position: 'fixed',

              top: 0,

              left: 0,

              width: '100%',

              height: '100%',

              backgroundColor:
                'rgba(0,0,0,0.5)',

              display: 'flex',

              justifyContent:
                'center',

              alignItems:
                'center',

              zIndex: 999
            }}
          >

            <div

              style={{

                backgroundColor:
                  'white',

                padding: 20,

                borderRadius: 10,

                width: '90%',

                maxWidth: 500
              }}
            >

              <h2>
                Nuevo turno
              </h2>

              <input

                placeholder=
                  "Paciente"

                value={nuevoPaciente}

                onChange={(e) =>
                  setNuevoPaciente(
                    e.target.value
                  )
                }
              />

              <br /><br />

              <select

                value={nuevoProfesional}

                onChange={(e) =>
                  setNuevoProfesional(
                    e.target.value
                  )
                }
              >

                <option value="">
                  Profesional
                </option>

                {

                  users.map(
                    (u) => (

                      <option

                        key={u.id}

                        value={u.id}
                      >

                        {u.nombre}

                      </option>
                    )
                  )
                }

              </select>

              <br /><br />

              <input

                type="text"

                placeholder="HH:MM"

                value={nuevaHora}

                onChange={(e) =>
                  setNuevaHora(
                    e.target.value
                  )
                }
              />

              <br /><br />

              <select

                value={nuevoTipo}

                onChange={(e) =>
                  setNuevoTipo(
                    e.target.value
                  )
                }
              >

                <option value="primera_vez">
                  Primera vez
                </option>

                <option value="consulta">
                  Consulta
                </option>

                <option value="reunion">
                  Reunión
                </option>

                <option value="evaluacion">
                  Evaluación
                </option>

                <option value="devolucion">
                  Devolución
                </option>

                <option value="entrenamiento">
                  Entrenamiento
                </option>

              </select>

              <br /><br />

              <textarea

                placeholder=
                  "Observaciones"

                value={
                  nuevasObservaciones
                }

                onChange={(e) =>
                  setNuevasObservaciones(
                    e.target.value
                  )
                }
              />

              <br /><br />

              <button

                onClick={
                  crearTurnoDesdeCalendario
                }
              >

                Crear turno

              </button>

              {' '}

              <button

                onClick={() =>
                  setDiaSeleccionado(
                    null
                  )
                }
              >

                Cancelar

              </button>

            </div>

          </div>
        )
      }

      {

        turnoEditando && (

          <div

            style={{

              position: 'fixed',

              top: 0,

              left: 0,

              width: '100%',

              height: '100%',

              backgroundColor:
                'rgba(0,0,0,0.5)',

              display: 'flex',

              justifyContent:
                'center',

              alignItems:
                'center',

              zIndex: 999
            }}
          >

            <div

              style={{

                backgroundColor:
                  'white',

                padding: 20,

                borderRadius: 10,

                width: '90%',

                maxWidth: 500
              }}
            >

              <h2>
                Editar turno
              </h2>

              <p>

                Fecha:
                {' '}

                {
                  fechaLatina(
                    turnoEditando.fecha_inicio
                  )
                }

              </p>

              <p>

                Hora:
                {' '}

                {
                  hora24(
                    turnoEditando.fecha_inicio
                  )
                }

              </p>

              <input

                value={editPaciente}

                onChange={(e) =>
                  setEditPaciente(
                    e.target.value
                  )
                }
              />

              <br /><br />

              <input

                type="date"

                value={editFecha}

                onChange={(e) =>
                  setEditFecha(
                    e.target.value
                  )
                }
              />

              <br /><br />

              <input

                type="text"

                placeholder="HH:MM"

                value={editHora}

                onChange={(e) =>
                  setEditHora(
                    e.target.value
                  )
                }
              />

              <br /><br />

              <select

                value={editTipo}

                onChange={(e) =>
                  setEditTipo(
                    e.target.value
                  )
                }
              >

                <option value="primera_vez">
                  Primera vez
                </option>

                <option value="consulta">
                  Consulta
                </option>

                <option value="reunion">
                  Reunión
                </option>

                <option value="evaluacion">
                  Evaluación
                </option>

                <option value="devolucion">
                  Devolución
                </option>

                <option value="entrenamiento">
                  Entrenamiento
                </option>

              </select>

              <br /><br />

              <textarea

                value={editObs}

                onChange={(e) =>
                  setEditObs(
                    e.target.value
                  )
                }
              />

              <br /><br />

              <button
                onClick={
                  guardarEdicion
                }
              >

                Guardar

              </button>

              {' '}

              <button

                onClick={() =>
                  cambiarEstadoTurno(
                    turnoEditando.id,
                    'realizado'
                  )
                }
              >

                Realizado

              </button>

              {' '}

              <button

                onClick={() =>
                  cambiarEstadoTurno(
                    turnoEditando.id,
                    'cancelado'
                  )
                }
              >

                Cancelado

              </button>

              {' '}

              <button

                onClick={() =>
                  setTurnoEditando(
                    null
                  )
                }
              >

                Cerrar

              </button>

            </div>

          </div>
        )
      }

    </div>
  )
}

export default AgendaMensual

