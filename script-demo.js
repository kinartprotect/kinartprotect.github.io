// ============================================
// 2. OBTENER ESTADO DEL USUARIO (SOLO LECTURA)
// ============================================
async function obtenerEstadoUsuario() {
    try {
        if (!deviceHash) {
            deviceHash = await generarHuellaDispositivo();
        }
        console.log('🔑 Device Hash:', deviceHash);
        
        // ✅ SOLO CONSULTAR - NUNCA INSERTAR
        const { data, error } = await supabaseClient
            .from('usos_temporales')
            .select('contador, limite_usos, fecha_expiracion')
            .eq('device_hash', deviceHash)
            .order('fecha_inicio', { ascending: false })
            .limit(1);
        
        if (error) {
            console.error('Error al obtener estado:', error);
            return { 
                existe: false, 
                contador: 0, 
                limite: limitePorDefecto, 
                usosRestantes: limitePorDefecto,
                mensaje: 'Error al verificar el estado' 
            };
        }
        
        // ✅ Si no hay registros, NO CREAR NADA
        if (!data || data.length === 0) {
            console.log('📝 Usuario nuevo - NO se crea registro todavía');
            return { 
                existe: false, 
                contador: 0, 
                limite: limitePorDefecto, 
                usosRestantes: limitePorDefecto,
                mensaje: '¡Bienvenido! Tienes 5 usos gratuitos.' 
            };
        }
        
        // ✅ Si hay registros, leerlos
        const registro = data[0];
        const fechaExpiracion = new Date(registro.fecha_expiracion);
        const ahora = new Date();
        
        // Verificar si expiró
        if (ahora > fechaExpiracion) {
            return { 
                existe: true, 
                contador: registro.contador, 
                limite: registro.limite_usos || limitePorDefecto,
                usosRestantes: 0,
                mensaje: '⏰ Tu prueba ha expirado. ¡Regístrate para continuar!',
                expirado: true
            };
        }
        
        // Usuario existente y activo
        const contador = registro.contador;
        const limite = registro.limite_usos || limitePorDefecto;
        const restantes = Math.max(0, limite - contador);
        
        let mensaje = `Te quedan ${restantes} usos gratuitos`;
        if (restantes === 0) {
            mensaje = '🚫 Has agotado tus usos gratuitos. ¡Regístrate para continuar!';
        } else if (restantes === 1) {
            mensaje = '⚠️ ¡Último uso gratuito!';
        }
        
        return { 
            existe: true, 
            contador: contador, 
            limite: limite, 
            usosRestantes: restantes,
            mensaje: mensaje
        };
        
    } catch (error) {
        console.error('Error en obtenerEstadoUsuario:', error);
        return { 
            existe: false, 
            contador: 0, 
            limite: limitePorDefecto, 
            usosRestantes: limitePorDefecto,
            mensaje: 'Error al verificar el estado' 
        };
    }
}

// ============================================
// 3. REGISTRAR UN NUEVO USO (SOLO AL GENERAR QR)
// ============================================
async function registrarUso() {
    try {
        // Primero, obtener el estado actual (sin modificar)
        const estado = await obtenerEstadoUsuario();
        
        // Si ya no tiene usos disponibles o expiró
        if (estado.usosRestantes <= 0 || estado.expirado) {
            return { 
                permitido: false, 
                usosRestantes: estado.usosRestantes, 
                mensaje: estado.expirado ? '⏰ Tu prueba ha expirado. ¡Regístrate para continuar!' : '🚫 Has agotado tus usos gratuitos.' 
            };
        }
        
        // ✅ Si es nuevo usuario, crear el primer registro AQUÍ
        if (!estado.existe) {
            console.log('📝 Creando primer registro para:', deviceHash);
            const { error: insertError } = await supabaseClient
                .from('usos_temporales')
                .insert({
                    device_hash: deviceHash,
                    user_agent: navigator.userAgent,
                    contador: 1,
                    limite_usos: limitePorDefecto,
                    fecha_expiracion: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 horas
                });
            
            if (insertError) {
                console.error('Error al crear registro:', insertError);
                return { permitido: false, mensaje: 'Error al registrar el uso' };
            }
            
            const restantes = limitePorDefecto - 1;
            return { 
                permitido: true, 
                usosRestantes: restantes, 
                mensaje: restantes > 0 ? `Te quedan ${restantes} usos gratuitos` : '⚠️ ¡Último uso gratuito!' 
            };
        }
        
        // ✅ Si ya existe, incrementar el contador
        console.log('📈 Incrementando contador para:', deviceHash);
        const nuevoContador = estado.contador + 1;
        const { error: updateError } = await supabaseClient
            .from('usos_temporales')
            .update({
                contador: nuevoContador,
                fecha_ultimo_uso: new Date().toISOString()
            })
            .eq('device_hash', deviceHash);
        
        if (updateError) {
            console.error('Error al actualizar contador:', updateError);
            return { permitido: false, mensaje: 'Error al actualizar el contador' };
        }
        
        const restantes = estado.limite - nuevoContador;
        let mensaje = restantes > 0 ? `Te quedan ${restantes} usos gratuitos` : '⚠️ ¡Último uso gratuito!';
        
        return { 
            permitido: true, 
            usosRestantes: restantes, 
            mensaje: mensaje 
        };
        
    } catch (error) {
        console.error('Error en registrarUso:', error);
        return { permitido: false, mensaje: 'Error al registrar el uso' };
    }
}