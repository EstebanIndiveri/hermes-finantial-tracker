# Hermes Finance 💰

> Asistente financiero personal con seguimiento de gastos, presupuestos por categoría y notificaciones inteligentes vía Telegram.

Hermes Finance es un sistema completo de gestión financiera personal que te ayuda a mantener el control de tus gastos mensuales, establecer presupuestos por categoría, y recibir alertas automáticas cuando te acercas a los límites. Todo gestionado desde Telegram o una interfaz web moderna.

## 🚀 Stack Tecnológico

- **Frontend**: [Next.js 15](https://nextjs.org/) con App Router, TypeScript, Tailwind CSS
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/) (Radix UI + Tailwind)
- **Base de datos**: [Turso](https://turso.tech/) (SQLite edge distribuido) + [Drizzle ORM](https://orm.drizzle.team/)
- **Bot**: [Telegram Bot API](https://core.telegram.org/bots/api)
- **IA (opcional)**: [Groq API](https://groq.com/) para interpretación de gastos en lenguaje natural
- **Deploy**: [Vercel](https://vercel.com/) con Cron Jobs

## 📋 Características

- ✅ **Registro de gastos** vía Telegram o interfaz web
- ✅ **Presupuestos por categoría** con semáforo de estado (OK / WARNING / CLOSED)
- ✅ **Tipo de cambio automático** desde Ripio API
- ✅ **Semáforo de ahorro** (verde, amarillo, rojo) según meta mensual
- ✅ **Dashboard interactivo** con gráficos de gastos
- ✅ **Notificaciones proactivas** cuando se alcanza el 80% del presupuesto
- ✅ **Comandos naturales** vía Groq para registrar gastos ("gasté 47k en el super")
- ✅ **Soft delete** para corregir errores sin perder historial

## 🛠 Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/EstebanIndiveri/hermes-finantial-tracker.git
cd hermes-finantial-tracker
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Copia el archivo de ejemplo y rellena con tus valores:

```bash
cp .env.example .env
```

#### Variables requeridas:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `TURSO_DATABASE_URL` | URL de tu base de datos Turso | `libsql://your-db.turso.io` |
| `TURSO_AUTH_TOKEN` | Token de autenticación de Turso | `eyJhbGc...` |
| `TELEGRAM_BOT_TOKEN` | Token de tu bot de Telegram | `123456:ABC-DEF...` |
| `TELEGRAM_ALLOWED_USER_ID` | ID de tu usuario de Telegram | `123456789` |
| `TELEGRAM_SECRET_TOKEN` | Token secreto para webhook | `cualquier_string_random` |
| `GROQ_API_KEY` | API key de Groq (opcional) | `gsk_...` |
| `GROQ_MODEL` | Modelo de Groq a usar | `llama3-8b-8192` |
| `CRON_SECRET` | Secret para proteger endpoint de cron | `otro_string_random` |
| `WEB_ACCESS_TOKEN` | Token para acceso web | `token_seguro_random` |
| `SESSION_SECRET` | Secret para sesiones web | `secret_para_sessions` |

### 4. Configurar base de datos

```bash
# Generar esquema
npm run db:generate

# Ejecutar migraciones
npm run db:migrate

# Cargar datos iniciales (categorías)
npm run db:seed
```

### 5. Ejecutar en desarrollo

```bash
npm run dev
```

La aplicación estará disponible en [http://localhost:3000](http://localhost:3000)

## 🚀 Deploy en Vercel

### 1. Conectar repositorio

1. Crea una cuenta en [Vercel](https://vercel.com)
2. Importa el repositorio desde GitHub
3. Vercel detectará automáticamente Next.js

### 2. Configurar variables de entorno

En el dashboard de Vercel, ve a **Settings → Environment Variables** y agrega todas las variables del `.env`:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_ID`
- `TELEGRAM_SECRET_TOKEN`
- `GROQ_API_KEY` (opcional)
- `GROQ_MODEL`
- `CRON_SECRET`
- `WEB_ACCESS_TOKEN`
- `SESSION_SECRET`

### 3. Configurar Cron Job

Vercel usa el archivo `vercel.json` para configurar cron jobs. Ya está configurado para ejecutar el tipo de cambio diario a las 00:00 UTC.

Para verificar que funciona:
1. Despliega el proyecto
2. Ve a **Settings → Cron Jobs** en Vercel
3. Verifica que el job `daily-exchange-rate` esté activo

### 4. Deploy

```bash
npm run build  # verificar que el build funciona localmente
git push origin main  # Vercel despliega automáticamente
```

## 🤖 Configuración del Bot de Telegram

### 1. Crear el bot

1. Abre Telegram y busca [@BotFather](https://t.me/BotFather)
2. Envía `/newbot`
3. Sigue las instrucciones para elegir nombre y username
4. Copia el token que te da (formato: `123456:ABC-DEF...`)
5. Pégalo en `TELEGRAM_BOT_TOKEN` en tu `.env`

### 2. Obtener tu User ID

1. Busca [@userinfobot](https://t.me/userinfobot) en Telegram
2. Envía `/start`
3. Copia tu ID (un número como `123456789`)
4. Pégalo en `TELEGRAM_ALLOWED_USER_ID` en tu `.env`

### 3. Configurar el webhook

Después del deploy en Vercel, configura el webhook:

```bash
curl -X POST "https://api.telegram.org/bot<TU_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://tu-app.vercel.app/api/telegram/webhook",
    "secret_token": "<TU_TELEGRAM_SECRET_TOKEN>"
  }'
```

Reemplaza:
- `<TU_BOT_TOKEN>` con tu token de Telegram
- `tu-app.vercel.app` con tu dominio de Vercel
- `<TU_TELEGRAM_SECRET_TOKEN>` con el valor de `TELEGRAM_SECRET_TOKEN` de tu `.env`

## 📱 Comandos de Telegram

Una vez configurado el bot, puedes usar estos comandos:

### Comandos básicos

```
/start
Mensaje de bienvenida y lista de comandos disponibles

/gasto 47000 supermercado Carrefour
Registra un gasto de $47,000 ARS en la categoría "supermercado" con descripción "Carrefour"
Formato: /gasto <monto> <categoría> [descripción opcional]

/resumen
Muestra un resumen del mes actual: ingreso, gasto total, ahorro proyectado, % ahorro

/disponible supermercado
Consulta cuánto presupuesto queda disponible en la categoría "supermercado"

/ultimo
Muestra el último gasto registrado

/borrar_ultimo
Elimina (soft delete) el último gasto registrado
```

### Comandos con IA (si configuraste Groq)

```
gasto 47k en el super para la comida de la semana
Interpreta el gasto en lenguaje natural y lo registra automáticamente
```

### Ejemplos de uso

```
/gasto 12500 transporte SUBE
→ Registra $12,500 en transporte

/gasto 85000 supermercado Día
→ Registra $85,000 en supermercado

/disponible supermercado
→ "Supermercado 🛒: $45,000 disponibles de $130,000 (65% gastado)"

/resumen
→ Muestra dashboard mensual con todas las categorías

/ultimo
→ "Último gasto: $12,500 en Transporte 🚗 (SUBE)"

/borrar_ultimo
→ "Gasto eliminado: $12,500 en Transporte"
```

## 🗂 Estructura del proyecto

```
hermes-finantial-tracker/
├── app/
│   ├── api/
│   │   ├── auth/              # Login/logout
│   │   ├── categories/        # GET /api/categories
│   │   ├── cron/              # Cron job para tipo de cambio
│   │   ├── settings/          # Configuración mensual
│   │   ├── telegram/          # Webhook de Telegram
│   │   └── transactions/      # CRUD de transacciones
│   ├── dashboard/             # Dashboard principal
│   │   ├── settings/          # Página de ajustes
│   │   └── page.tsx
│   ├── login/                 # Página de login
│   └── layout.tsx             # Layout global con dark mode
├── components/
│   ├── dashboard/             # Componentes del dashboard
│   ├── forms/                 # Formularios (ExpenseForm)
│   └── ui/                    # Componentes de shadcn/ui
├── lib/
│   ├── db/                    # Cliente Drizzle y schema
│   ├── finance/               # Lógica de negocio (summaries, budgets)
│   ├── telegram/              # Handlers del bot
│   └── utils/                 # Utilidades (fechas, validaciones)
└── __tests__/                 # Tests unitarios
```

## Reintegros

La funcionalidad de reintegros permite a los miembros de un dashboard solicitar el reembolso de gastos realizados.

### Flujo

1. **Registro de gasto con reintegro**: Al registrar un gasto (web o bot), se puede marcar "Requiere reintegro"
2. **Notificación**: Se notifica a los miembros del dashboard vía Telegram y Web Push
3. **Datos de pago**: El solicitante configura sus datos de pago (CBU/Alias/Efectivo) en Configuración
4. **Pago**: El pagador marca el reintegro como pagado desde la web o con el comando /reintegros
5. **Confirmación**: El solicitante recibe notificación del pago

### Comandos Telegram

- `/reintegros` - Ver reintegros pendientes y marcar como pagados

### Configuración

Agregar al archivo `.env.local`:

```env
# Web Push VAPID keys (generar con: npx web-push generate-vapid-keys)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=tu_clave_publica
VAPID_PRIVATE_KEY=tu_clave_privada
```

## 🧪 Tests

```bash
# Ejecutar todos los tests
npm test

# Tests en modo watch
npm run test:watch

# Tests con coverage
npm run test:coverage
```

## 📊 Categorías por defecto

El seed inicial crea estas categorías:

| Emoji | Nombre | Slug |
|-------|--------|------|
| 🛒 | Supermercado | supermercado |
| 🍔 | Delivery/Salidas | delivery |
| 🚗 | Transporte | transporte |
| 🎮 | Entretenimiento | entretenimiento |
| 💊 | Salud | salud |
| 🏠 | Hogar/Servicios | hogar |
| 🐱 | Mascotas | mascotas |
| 👕 | Ropa | ropa |
| 🎁 | Regalos | regalos |
| 📚 | Educación | educacion |
| 💰 | Otros | otros |

## 🔐 Seguridad

- ✅ Webhook protegido con `TELEGRAM_SECRET_TOKEN`
- ✅ Cron jobs protegidos con `CRON_SECRET`
- ✅ Validación de `TELEGRAM_ALLOWED_USER_ID` (solo tú puedes usar el bot)
- ✅ Web access protegido con `WEB_ACCESS_TOKEN`
- ✅ Sesiones seguras con `SESSION_SECRET`
- ✅ Variables sensibles en `.env` (nunca commiteadas)

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'feat: agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## 📝 Licencia

MIT License - ver el archivo [LICENSE](LICENSE) para más detalles.

## 🙋‍♂️ Soporte

Si tienes problemas o preguntas:

1. Revisa la [documentación en `/docs`](./docs)
2. Abre un [issue](https://github.com/EstebanIndiveri/hermes-finantial-tracker/issues)
3. Contacta al autor: [@EstebanIndiveri](https://github.com/EstebanIndiveri)

---

Hecho con ❤️ por [Esteban Indiveri](https://github.com/EstebanIndiveri)
