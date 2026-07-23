# --- CONFIGURACIÓN (REEMPLAZA LOS DATOS ENTRE COMILLAS) ---
$token = "EAAWNZCeY3cX0BSGl2lbkdFw6vNkjKSVWnH83lyJrdaXb4xHbi2vJvno1jp2AnAdZBCpB9dzZBZCIl3e4hZCUEN0zby40hRuM6LEPpU5HdnijqV8GRaDqSo7C2EZB19VDt6pxUbpziuyxgbUT88nXuGIR84rpUmcZCBiHRCeIojrF4tXZBIhlQOBqtZA3VefhkBQpo8rcBf4I5DaCoqLaVBhi2QwBTZCZAVx84UZCp5NhxSs6GRDigZB1evKjvgGzDvS3zB6oC412jZCsGG9BZBFjyUZAktABQyn0V83yg3IS3F7taIgZD
"
$phone_number_id = "1193060133894500"
$numero_destino = "5493813679123" # PON TU NÚMERO PERSONAL AQUÍ PARA PROBAR

# --- PREPARACIÓN DE LA SOLICITUD ---
$url = "https://graph.facebook.com/v21.0/$phone_number_id/messages"

$body = @{
    messaging_product = "whatsapp"
    to = $numero_destino
    type = "template"
    template = @{
        name = "recordatorio_profesional"
        language = @{ code = "es_AR" }
        components = @(
            @{
                type = "body"
                parameters = @(
                    @{ type = "text"; text = "Ana Jiménez" },           # {{nombre_profesional}}
                    @{ type = "text"; text = "25 de Julio" },           # {{fecha_agenda}}
                    @{ type = "text"; text = "Juan Pérez, María López" } # {{lista_turnos}}
                )
            }
        )
    }
} | ConvertTo-Json -Depth 10

# --- ENVÍO Y VERIFICACIÓN ---
Write-Host "Intentando enviar mensaje a: $numero_destino..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
    Write-Host "¡ÉXITO! Mensaje enviado correctamente." -ForegroundColor Green
    Write-Host "ID del mensaje: $($response.messages.id)" -ForegroundColor Green
}
catch {
    Write-Host "ERROR DETECTADO:" -ForegroundColor Red
    Write-Host $_.Exception.ToString() -ForegroundColor Yellow
    if ($_.Exception.Response) {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        Write-Host "Detalle del servidor Meta: " -ForegroundColor Cyan
        Write-Host $reader.ReadToEnd() -ForegroundColor White
    }
}