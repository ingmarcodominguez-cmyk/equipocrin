
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

  const [users, setUsers] =
    useState([])

  const [agendas, setAgendas] =
    useState([])

  const [rol, setRol] =
    useState('')

  const [
    profesionalSeleccionado,
    setProfesionalSeleccionado
  ] = useState('')

  const dias = [

    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes'
  ]

  const horarios = []

  let hora = 9
  let minuto = 0

  while (

    hora < 21 ||

    (
      hora === 20 &&
      minuto <= 45
    )
  ) {

    const hh =
      String(hora)
        .padStart(2, '0')

    const mm =
      String(minuto)
        .padStart(2, '0')

    horarios.push(
      `${hh}:${mm}`
    )

    minuto += 45

    if (minuto >= 60) {

      hora += 1
      minuto -= 60
    }
  }

  useEffect(() => {

    iniciar()

  }, [])

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

        setProfesionalSeleccionado(
          user.id
        )

        cargarAgenda(
          user.id
        )
      }
    }

    cargarUsuarios()
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

  async function cargarAgenda(
    profesionalId
  ) {

    const { data } =

      await supabase

        .from(
          'agendas_fijas'
        )

        .select('*')

        .eq(
          'profesional_id',
          profesionalId
        )

    if (data) {

      setAgendas(data)
    }
  }

  async function crearAgenda(
    dia,
    horario
  ) {

    const paciente =
      prompt(
        'Paciente'
      )

    if (!paciente) return

    const prestacion =
      prompt(
        'Prestación'
      )


const duracion =
  prompt(
    'Duración en minutos',
    '45'
  )



    await supabase

      .from(
        'agendas_fijas'
      )

      
.insert([{

  paciente_nombre:
    paciente,

  profesional_id:
    profesionalSeleccionado,

  dia_semana:
    dia,

  hora_inicio:
    horario,


hora_fin:

  sumarMinutos(
    horario,
    duracion
  ),



  tipo_prestacion:
    prestacion
}])



    cargarAgenda(
      profesionalSeleccionado
    )
  }



function sumarMinutos(
  hora,
  minutosAgregar
) {

  let [

    hh,
    mm

  ] = hora.split(':')

  hh = Number(hh)
  mm = Number(mm)

  mm += Number(
    minutosAgregar
  )

  while (mm >= 60) {

    hh += 1
    mm -= 60
  }

  return (

    String(hh)
      .padStart(2, '0')

    +

    ':'

    +

    String(mm)
      .padStart(2, '0')
  )
}




  function buscarAgenda(
    dia,
    horario
  ) {

    return agendas.find(

      (a) =>

        a.dia_semana
        === dia

        &&

        a.hora_inicio
        ?.substring(0,5)

        === horario
    )
  }

  return (

    <div
      style={{
        padding: 20
      }}
    >

      <h1>

        Agenda semanal

      </h1>

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
              profesionalSeleccionado
            }

            onChange={(e) => {

              setProfesionalSeleccionado(
                e.target.value
              )

              cargarAgenda(
                e.target.value
              )
            }}
          >

            <option value="">
              Seleccionar profesional
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

      <br /><br />

      <div

        style={{

          display: 'grid',

          gridTemplateColumns:
            '80px repeat(5, 1fr)',

          gap: 2
        }}
      >

        <div />

        {

          dias.map(
            (dia) => (

              <div

                key={dia}

                style={{

                  backgroundColor:
                    '#0d6efd',

                  color:
                    'white',

                  padding: 10,

                  textAlign:
                    'center',

                  fontWeight:
                    'bold'
                }}
              >

                {dia}

              </div>
            )
          )
        }

        {

          horarios.map(
            (horario) => (

              <>

                <div

                  style={{

                    border:
                      '1px solid #ccc',

                    padding: 10,

                    fontSize: 12,

                    backgroundColor:
                      '#f8f9fa'
                  }}
                >

                  {horario}

                </div>

                {

                  dias.map(
                    (dia) => {

                      const agenda =
                        buscarAgenda(
                          dia,
                          horario
                        )


let altura = 70

if (agenda) {

  const inicio =

    agenda.hora_inicio
      ?.substring(0,5)

  const fin =

    agenda.hora_fin
      ?.substring(0,5)

  const [h1, m1] =
    inicio.split(':')

  const [h2, m2] =
    fin.split(':')

  const minutosInicio =

    Number(h1) * 60

    +

    Number(m1)

  const minutosFin =

    Number(h2) * 60

    +

    Number(m2)

  const duracion =

    minutosFin -
    minutosInicio

  altura =
    (duracion / 45) * 70
}



                      return (

                        <div

                          key={
                            dia +
                            horario
                          }

                          onClick={() =>

                            !agenda

                            &&

                            profesionalSeleccionado

                            &&

                            crearAgenda(
                              dia,
                              horario
                            )
                          }

                          style={{

                            border:
                              '1px solid #ddd',

                            

minHeight:
  altura,



                            padding: 5,

                            cursor:
                              'pointer',

                            backgroundColor:

                              agenda

                              ?

                              '#d1e7dd'

                              :

                              'white'
                          }}
                        >

                          {

                            agenda && (

                              <>

                                <strong>

                                  {
                                    agenda
                                      .paciente_nombre
                                  }

                                </strong>

                                <br />

                                <small>

                                  {
                                    agenda
                                      .tipo_prestacion
                                  }

                                </small>

                              </>
                            )
                          }

                        </div>
                      )
                    }
                  )
                }

              </>
            )
          )
        }

      </div>

    </div>
  )
}

export default AgendaFija

