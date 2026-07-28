// ============================================
// CONFIGURACIÓN DE SUPABASE
// ============================================
const SUPABASE_URL = 'https://tgeuouzusahpwgjfciko.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnZXVvdXp1c2FocHdnamZjaWtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzk2NjgsImV4cCI6MjEwMDc1NTY2OH0.dDMkWqsb1t5uYg7z5vLFtXdS3gsLTYbh4r4m_1JBq-o';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// VARIABLES GLOBALES
// ============================================
let usosDisponibles = 0;
let deviceHash = '';

// ============================================
// 1. GENERAR HUELLA DE DISPOSITIVO
// ============================================
async function generarHuellaDispositivo() {
    const datos = {
        userAgent: navigator.userAgent,
        idioma: navigator.language,
        zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone,
        pantalla: `${screen.width}x${screen.height}`,
        profundidadColor: screen.colorDepth,
        plataforma: navigator.platform,
        memoria: navigator.deviceMemory || 0,
        nucleos: navigator.hardwareConcurrency || 0
    };
    
    const texto = JSON.stringify(datos);
    const encoder = new TextEncoder();
    const data = encoder.encode(texto);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
}

// ============================================
// 2. VERIFICAR LÍMITE DE USOS
// ============================================
async function verificarLimiteUso() {
    try {
        // Generar huella del dispositivo
        deviceHash = await generarHuellaDispositivo();
        console.log('🔑 Device Hash:', deviceHash);
        
        // Consultar límite en Supabase
        const { data, error } = await supabaseClient
            .from('usos_temporales')
            .select('contador, limite_usos, fecha_expiracion')
            .eq('device_hash', deviceHash)
            .order('fecha_inicio', { ascending: false })
            .limit(1);
        
        if (error) {
            console.error('Error al verificar límite:', error);
            return { permitido: false, mensaje: 'Error al verificar el límite' };
        }
        
        // Si no hay registros, es el primer uso
        if (!data || data.length === 0) {
            // Crear nuevo registro
            const { error: insertError } = await supabaseClient
                .from('usos_temporales')
                .insert({
                    device_hash: deviceHash,
                    user_agent: navigator.userAgent,
                    contador: 1,
                    limite_usos: 5,
                    fecha_expiracion: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 horas
                });
            
            if (insertError) {
                console.error('Error al crear registro:', insertError);
                return { permitido: false, mensaje: 'Error al registrar el uso' };
            }
            
            usosDisponibles = 4; // 5 - 1 = 4 usos restantes
            return { permitido: true, usosRestantes: 4, mensaje: '¡Bienvenido! Tienes 5 usos gratuitos.' };
        }
        
        // Verificar si expiró
        const registro = data[0];
        const fechaExpiracion = new Date(registro.fecha_expiracion);
        const ahora = new Date();
        
        if (ahora > fechaExpiracion) {
            // Expiró, reiniciar
            const { error: updateError } = await supabaseClient
                .from('usos_temporales')
                .update({
                    contador: 1,
                    fecha_inicio: ahora.toISOString(),
                    fecha_expiracion: new Date(ahora.getTime() + 24 * 60 * 60 * 1000).toISOString(),
                    fecha_ultimo_uso: ahora.toISOString()
                })
                .eq('device_hash', deviceHash);
            
            if (updateError) {
                console.error('Error al reiniciar usos:', updateError);
                return { permitido: false, mensaje: 'Error al reiniciar el límite' };
            }
            
            usosDisponibles = 4;
            return { permitido: true, usosRestantes: 4, mensaje: '¡Tu prueba ha sido renovada! Tienes 5 usos.' };
        }
        
        // Verificar si ya usó todos
        const usos = registro.contador;
        const limite = registro.limite_usos || 5;
        const restantes = limite - usos;
        
        if (usos >= limite) {
            return { permitido: false, usosRestantes: 0, mensaje: 'Has agotado tus usos gratuitos. ¡Regístrate para continuar!' };
        }
        
        // Actualizar contador
        const nuevoContador = usos + 1;
        const { error: updateError } = await supabaseClient
            .from('usos_temporales')
            .update({
                contador: nuevoContador,
                fecha_ultimo_uso: ahora.toISOString()
            })
            .eq('device_hash', deviceHash);
        
        if (updateError) {
            console.error('Error al actualizar contador:', updateError);
            return { permitido: false, mensaje: 'Error al actualizar el contador' };
        }
        
        usosDisponibles = restantes - 1;
        return { permitido: true, usosRestantes: restantes - 1, mensaje: `Te quedan ${restantes - 1} usos gratuitos` };
        
    } catch (error) {
        console.error('Error en verificarLimiteUso:', error);
        return { permitido: false, mensaje: 'Error al verificar el límite' };
    }
}

// ============================================
// 3. ACTUALIZAR CONTADOR EN LA INTERFAZ
// ============================================
function actualizarContador(usosRestantes, mensaje) {
    const contadorElement = document.getElementById('usosDisponibles');
    const mensajeElement = document.getElementById('mensajeUso');
    const btnGenerar = document.getElementById('btnGenerar');
    const mensajeContainer = document.getElementById('mensajeUsoContainer');
    
    if (usosRestantes !== undefined) {
        contadorElement.textContent = usosRestantes;
    }
    
    if (mensaje) {
        mensajeElement.textContent = mensaje;
        
        // Cambiar color según el mensaje
        if (mensaje.includes('agotado') || mensaje.includes('Error')) {
            mensajeElement.style.color = '#d32f2f';
            btnGenerar.disabled = true;
            btnGenerar.textContent = '🚫 Usos agotados';
        } else if (mensaje.includes('1 uso')) {
            mensajeElement.style.color = '#e65100';
        } else {
            mensajeElement.style.color = '#2e7d32';
        }
    }
    
    // Mostrar mensaje adicional si hay
    if (mensajeContainer) {
        let clase = 'mensaje-uso info';
        if (mensaje && mensaje.includes('agotado')) clase = 'mensaje-uso error';
        else if (mensaje && mensaje.includes('1 uso')) clase = 'mensaje-uso warning';
        else if (mensaje && mensaje.includes('Bienvenido')) clase = 'mensaje-uso success';
        
        mensajeContainer.innerHTML = `<div class="${clase}">${mensaje || ''}</div>`;
    }
}

// ============================================
// 4. GENERAR QR (DEMO)
// ============================================
async function generarQRDemo() {
    const btnGenerar = document.getElementById('btnGenerar');
    btnGenerar.disabled = true;
    btnGenerar.textContent = '⏳ Verificando...';
    
    // Verificar límite
    const resultado = await verificarLimiteUso();
    
    if (!resultado.permitido) {
        actualizarContador(0, resultado.mensaje);
        btnGenerar.disabled = false;
        btnGenerar.textContent = '🎨 Generar QR';
        return;
    }
    
    // Actualizar contador en la interfaz
    actualizarContador(resultado.usosRestantes, resultado.mensaje);
    
    // Generar QR
    const artista = document.getElementById('artista').value.trim() || 'Anónimo';
    const fecha = document.getElementById('fecha').value || 'Fecha no especificada';
    const contacto = document.getElementById('contacto').value.trim() || 'Sin contacto';
    const cliente = document.getElementById('cliente').value.trim() || 'Sin cliente';
    const tiempo = document.getElementById('tiempo').value.trim() || 'No especificado';
    
    const textoQR = `Certificación: KinArtProtect (Demo)
Artista: ${artista}
Fecha de creación: ${fecha}
Contacto: ${contacto}
Cliente: ${cliente}
Tiempo de creación: ${tiempo}
Generado: ${new Date().toLocaleDateString()}`;
    
    const container = document.getElementById('qrContainer');
    container.classList.add('active');
    
    const qrDiv = document.getElementById('qrcode');
    qrDiv.innerHTML = '';
    
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(textoQR)}&color=2c1810&bgcolor=ffffff&margin=20`;
    
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'QR Code';
    img.style.width = '250px';
    img.style.height = '250px';
    img.id = 'qrImage';
    img.onerror = function() {
        alert('Error al generar el QR. Verifica tu conexión a internet.');
    };
    qrDiv.appendChild(img);
    
    document.getElementById('infoArtista').innerHTML = `
        <strong>Artista:</strong> ${artista} | 
        <strong>Cliente:</strong> ${cliente} | 
        <strong>Fecha:</strong> ${fecha} | 
        <span style="color: #2e7d32;">🎯 Demo</span>
    `;
    
    btnGenerar.disabled = false;
    btnGenerar.textContent = '🎨 Generar QR';
    
    console.log('✅ QR generado en modo demo. Usos restantes:', resultado.usosRestantes);
}

// ============================================
// 5. DESCARGAR QR (DEMO)
// ============================================
function descargarQRDemo() {
    const img = document.querySelector('#qrcode img');
    if (!img) {
        alert('Primero genera el QR');
        return;
    }
    
    const link = document.createElement('a');
    link.download = 'qr-kinartprotect-demo.png';
    link.href = img.src;
    link.click();
}

// ============================================
// 6. INICIALIZAR AL CARGAR LA PÁGINA
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🎨 KinArtProtect - Demo cargado');
    
    // Mostrar contador inicial
    const resultado = await verificarLimiteUso();
    if (resultado.permitido) {
        actualizarContador(resultado.usosRestantes, resultado.mensaje);
    } else {
        actualizarContador(0, resultado.mensaje);
    }
});