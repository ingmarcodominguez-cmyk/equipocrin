
import {
  useEffect,
  useState
}
from 'react'

import {
  supabase
}
from '../lib/supabase.js'

function AgendaFija() {

  const [sesiones, setSesiones] =
    useState([])

  const [pacientes, setPacientes] =
    useState([])

  const [users, setUsers] =
    useState([])

  const [rol, setRol] =
    useState('')

  const [

    profesionalSeleccionado,

    setProfesionalSeleccionado

  ] = useState('')

  const [dia, setDia] =
    useState('Lunes')

  const [hora, setHora] =
    useState('09:00')

  const [

    pacienteSeleccionado,

    setPacienteSeleccionado

  ] = useState('')

  const [

    prestadorSeleccionado,

    setPrestadorSeleccionado

  ] = useState('')

  const [

    prestacion,

    setPrestacion

  ] = useState('')

  const dias = [

    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes'
  ]

  const horarios = [

    '09:00',
    '09:45',
    '10:30',
    '11:15',
    '12:00',
    '12:45',
    '13:30',
    '14:15',
    '15:00',
    '15:45',
    '16:30',
    '17:15',
    '18:00',
    '18:45',
    '19:30',
    '20:15'
  ]

  useEffect(() => {

    iniciar()

  }, [])

  
useEffect(() => {

  if (

    rol
      ?.toLowerCase()

    ===

    'profesional'

    ||

    rol
      ?.toLowerCase()

    ===

    'auxiliar'
  ) {

    if (
      prestadorSeleccionado
    ) {

      cargarSesiones()
    }

  } else {

    cargarSesiones()
  }

}, [

  rol,

  prestadorSeleccionado
])



  async function iniciar() {

    const {

      data: { user }

    } = await supabase.auth
      .getUser()

    const { data } =

      await supabase

        .from('users')

        .select('*')

        .eq(
          'id',
          user.id
        )

        .single()

    if (data) {

      setRol(
        data.rol
      )

      if (

        data.rol
          ?.toLowerCase()

        ===

        'profesional'

        ||

        data.rol
          ?.toLowerCase()

        ===

        'auxiliar'
      ) {

        setPrestadorSeleccionado(
          user.id
        )
      }
    }

    

    cargarPacientes()

    cargarUsuarios()
  }

  async function cargarPacientes() {

    const { data } =

      await supabase

        .from('pacientes')

        .select('*')

        .order('nombre')

    if (data) {

      setPacientes(data)
    }
  }

  async function cargarUsuarios() {

    const { data } =

      await supabase

        .from('users')

        .select('*')

        .order('nombre')

    if (data) {

      setUsers(data)
    }
  }

  
async function cargarSesiones() {

  let query =

    supabase

      .from(
        'sesiones_fijas'
      )

      .select('*')

      .order(
        'hora'
      )

  if (

    rol
      ?.toLowerCase()

    ===

    'profesional'

    ||

    rol
      ?.toLowerCase()

    ===

    'auxiliar'
  ) {

    query =

      query.eq(

        'profesional_id',

        prestadorSeleccionado
      )
  }

  const { data } =
    await query

  if (data) {

    setSesiones(data)
  }
}


  async function agregarSesion() {

    const pacienteObj =

      pacientes.find(
        (p) =>
          p.id ===
          pacienteSeleccionado
      )

    if (!pacienteObj)
      return

    await supabase

      .from(
        'sesiones_fijas'
      )

      .insert([{

        paciente_id:
          pacienteObj.id,

        paciente_nombre:
          pacienteObj.nombre,

        profesional_id:
          prestadorSeleccionado,

        dia_semana:
          dia,

        hora,

        tipo_prestacion:
          prestacion
      }])

    setPacienteSeleccionado('')

    setPrestacion('')

    cargarSesiones()
  }

  const sesionesDia =

    sesiones.filter(
      (s) =>
        s.dia_semana === dia
    )

  return (

    <div
      style={{
        padding: 20
      }}
    >

      <h1>

        Agenda semanal

      </h1>

      <div

        style={{

          border:
            '1px solid #ccc',

          borderRadius: 10,

          padding: 15,

          marginBottom: 20
        }}
      >

        <select

          value={dia}

          onChange={(e) =>
            setDia(
              e.target.value
            )
          }
        >

          {

            dias.map(
              (d) => (

                <option
                  key={d}
                  value={d}
                >

                  {d}

                </option>
              )
            )
          }

        </select>

        {' '}

        <select

          value={hora}

          onChange={(e) =>
            setHora(
              e.target.value
            )
          }
        >

          {

            horarios.map(
              (h) => (

                <option
                  key={h}
                  value={h}
                >

                  {h}

                </option>
              )
            )
          }

        </select>

        <br /><br />

        <select

          value={
            pacienteSeleccionado
          }

          onChange={(e) =>

            setPacienteSeleccionado(
              e.target.value
            )
          }
        >

          <option value="">
            Paciente
          </option>

          {

            pacientes.map(
              (p) => (

                <option

                  key={p.id}

                  value={p.id}
                >

                  {p.nombre}

                </option>
              )
            )
          }

        </select>

        {' '}

        {

          rol
            ?.toLowerCase()

          !==

          'profesional'

          &&

          rol
            ?.toLowerCase()

          !==

          'auxiliar'

          &&

          (

            <select

              value={
                prestadorSeleccionado
              }

              onChange={(e) =>

                setPrestadorSeleccionado(
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
          )
        }

        {' '}

        <input

          placeholder="Prestación"

          value={prestacion}

          onChange={(e) =>

            setPrestacion(
              e.target.value
            )
          }
        />

        {' '}

        <button
          onClick={agregarSesion}
        >

          Agregar

        </button>

      </div>

      <h2>

        {dia}

      </h2>

      {

        horarios.map((h) => {

          const lista =

            sesionesDia.filter(
              (s) =>
                s.hora === h
            )

          if (
            lista.length === 0
          ) return null

          return (

            <div

              key={h}

              style={{

                border:
                  '1px solid #ddd',

                borderRadius: 10,

                padding: 10,

                marginBottom: 15
              }}
            >

              <strong>

                {h}

              </strong>

              <br /><br />

              {

                lista.map(
                  (s) => (

                    <div

                      key={s.id}

                      style={{

                        backgroundColor:
                          '#f8f9fa',

                        padding: 8,

                        borderRadius: 8,

                        marginBottom: 8
                      }}
                    >

                      <strong>

                        {
                          s.paciente_nombre
                        }

                      </strong>

                      {' - '}

                      {

                        users.find(
                          (u) =>
                            u.id ===
                            s.profesional_id
                        )?.nombre
                      }

                      <br />

                      <small>

                        {
                          s.tipo_prestacion
                        }

                      </small>

                    </div>
                  )
                )
              }

            </div>
          )
        })
      }

    </div>
  )
}

export default AgendaFija

