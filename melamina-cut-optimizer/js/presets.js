// Presets de Planchas y Muebles para MelaminaCut

const PLANCHA_PRESETS = [
    {
        id: "standard-2440-1830",
        name: "Estándar Novopan / Pelíkan / Masisa (2440 x 1830 mm)",
        largo: 2440,
        ancho: 1830,
        espesor: 18,
        material: "Blanco Texturado"
    },
    {
        id: "arauco-2500-1830",
        name: "Arauco / Tableros Especiales (2500 x 1830 mm)",
        largo: 2500,
        ancho: 1830,
        espesor: 18,
        material: "Roble Escandinavo"
    },
    {
        id: "jumbo-2750-1830",
        name: "Formato Jumbo / Vesto (2750 x 1830 mm)",
        largo: 2750,
        ancho: 1830,
        espesor: 18,
        material: "Vesto Cedro"
    },
    {
        id: "classic-4x8",
        name: "Clásica 4x8 pies / MDF / Triplay (2440 x 1220 mm)",
        largo: 2440,
        ancho: 1220,
        espesor: 15,
        material: "MDF Crudo"
    },
    {
        id: "half-sheet",
        name: "Media Plancha (1220 x 1220 mm)",
        largo: 1220,
        ancho: 1220,
        espesor: 18,
        material: "Blanco Mate"
    }
];

const MUEBLE_PRESETS = [
    {
        id: "velador",
        name: "Velador Moderno con 2 Cajones (Espesor 18mm)",
        material: "Roble Escandinavo",
        plancha: { largo: 2440, ancho: 1830, veta: true },
        parts: [
            // [Nombre, Largo, Ancho, Cant, Veta, CantoL1, CantoL2, CantoA1, CantoA2]
            // Canto: 0 = Ninguno, 1 = Delgado, 2 = Grueso
            { name: "Lateral Izquierdo", largo: 550, ancho: 400, cant: 1, veta: true, cantos: [1, 0, 2, 0] },
            { name: "Lateral Derecho", largo: 550, ancho: 400, cant: 1, veta: true, cantos: [1, 0, 2, 0] },
            { name: "Techo (Cubierta)", largo: 450, ancho: 400, cant: 1, veta: true, cantos: [2, 1, 2, 2] },
            { name: "Base inferior", largo: 414, ancho: 400, cant: 1, veta: true, cantos: [1, 0, 0, 0] },
            { name: "Frente Cajón", largo: 180, ancho: 408, cant: 2, veta: true, cantos: [2, 2, 2, 2] },
            { name: "Lateral Cajón", largo: 350, ancho: 120, cant: 4, veta: false, cantos: [1, 0, 0, 0] },
            { name: "Contrafrente Cajón", largo: 356, ancho: 120, cant: 4, veta: false, cantos: [1, 0, 0, 0] },
            { name: "Zócalo Base", largo: 414, ancho: 70, cant: 1, veta: false, cantos: [0, 0, 0, 0] },
            { name: "Amarre Trasero", largo: 414, ancho: 100, cant: 1, veta: false, cantos: [0, 0, 0, 0] }
        ]
    },
    {
        id: "cocina-alto",
        name: "Módulo Alto de Cocina (2 Puertas - Espesor 18mm)",
        material: "Blanco Mate",
        plancha: { largo: 2440, ancho: 1830, veta: false },
        parts: [
            { name: "Lateral Izquierdo", largo: 700, ancho: 300, cant: 1, veta: false, cantos: [1, 0, 1, 0] },
            { name: "Lateral Derecho", largo: 700, ancho: 300, cant: 1, veta: false, cantos: [1, 0, 1, 0] },
            { name: "Techo", largo: 800, ancho: 300, cant: 1, veta: false, cantos: [1, 0, 0, 0] },
            { name: "Base inferior", largo: 764, ancho: 300, cant: 1, veta: false, cantos: [1, 0, 0, 0] },
            { name: "Repisas Interiores", largo: 762, ancho: 280, cant: 2, veta: false, cantos: [1, 0, 0, 0] },
            { name: "Puerta Melamina", largo: 696, ancho: 396, cant: 2, veta: true, cantos: [2, 2, 2, 2] }
        ]
    },
    {
        id: "ropero-2puertas",
        name: "Ropero Básico 2 Puertas (Espesor 18mm)",
        material: "Vesto Cedro",
        plancha: { largo: 2440, ancho: 1830, veta: true },
        parts: [
            { name: "Costado Lateral", largo: 1800, ancho: 500, cant: 2, veta: true, cantos: [1, 0, 1, 0] },
            { name: "Techo Superior", largo: 900, ancho: 500, cant: 1, veta: true, cantos: [1, 0, 1, 1] },
            { name: "Base de Piso", largo: 864, ancho: 500, cant: 1, veta: true, cantos: [1, 0, 0, 0] },
            { name: "Puerta Principal", largo: 1680, ancho: 440, cant: 2, veta: true, cantos: [2, 2, 2, 2] },
            { name: "Estante Fijo", largo: 864, ancho: 480, cant: 2, veta: false, cantos: [1, 0, 0, 0] },
            { name: "División Vertical", largo: 1200, ancho: 480, cant: 1, veta: true, cantos: [1, 0, 0, 0] },
            { name: "Estante Chico", largo: 422, ancho: 480, cant: 3, veta: false, cantos: [1, 0, 0, 0] },
            { name: "Zócalo Frontal", largo: 864, ancho: 100, cant: 1, veta: false, cantos: [0, 0, 0, 0] },
            { name: "Zócalo Posterior", largo: 864, ancho: 100, cant: 1, veta: false, cantos: [0, 0, 0, 0] }
        ]
    }
];
