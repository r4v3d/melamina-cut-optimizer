// Datos persistentes del taller en localStorage: catálogo, retazos, proyectos y perfil

const KEYS = {
    materials: 'melaminacut_materials',
    retazos: 'melaminacut_retazos',
    projects: 'melaminacut_projects',
    currentProject: 'melaminacut_current_project',
    taller: 'melaminacut_taller',
    quoteSeq: 'melaminacut_quote_seq'
};

function read(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        return false; // cuota llena (p. ej. logo muy pesado)
    }
}

export function newId(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ===== Catálogo de materiales =====
// { id, name, largo, ancho, espesor, precio, veta }
const DEFAULT_MATERIALS = [
    { id: 'mat_mdf3', name: 'MDF Fondo 3mm', largo: 2440, ancho: 1830, espesor: 3, precio: 45, veta: false },
    { id: 'mat_roble18', name: 'Roble 18mm', largo: 2440, ancho: 1830, espesor: 18, precio: 180, veta: true }
];

export const materialsStore = {
    list() {
        return read(KEYS.materials, null) || DEFAULT_MATERIALS.map(m => ({ ...m }));
    },
    save(list) {
        return write(KEYS.materials, list);
    },
    byName(name) {
        return this.list().find(m => m.name === name) || null;
    },
    // Formato que entiende el optimizador: { [nombre]: { planchaLargo, planchaAncho, tieneVetaGlobal } }
    optimizerMap() {
        const map = {};
        for (const m of this.list()) {
            map[m.name] = { planchaLargo: m.largo, planchaAncho: m.ancho, tieneVetaGlobal: !!m.veta };
        }
        return map;
    }
};

// ===== Inventario de retazos =====
// { id, material, largo, ancho, origen, fecha }
export const retazosStore = {
    list() {
        return read(KEYS.retazos, []);
    },
    save(list) {
        return write(KEYS.retazos, list);
    },
    add(items) {
        const list = this.list();
        const now = new Date().toISOString();
        for (const it of items) {
            list.push({ id: newId('rz'), fecha: now, origen: '', ...it });
        }
        return this.save(list);
    },
    remove(ids) {
        const set = new Set(ids);
        return this.save(this.list().filter(r => !set.has(r.id)));
    },
    // Formato para el optimizador: { [material]: [{ id, largo, ancho }] }
    stockMap() {
        const map = {};
        for (const r of this.list()) {
            if (!map[r.material]) map[r.material] = [];
            map[r.material].push({ id: r.id, largo: r.largo, ancho: r.ancho });
        }
        return map;
    }
};

// ===== Proyectos =====
// { id, name, client: { nombre, telefono }, updatedAt, state }
export const projectsStore = {
    all() {
        return read(KEYS.projects, {});
    },
    list() {
        return Object.values(this.all()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    },
    get(id) {
        return this.all()[id] || null;
    },
    put(project) {
        const all = this.all();
        all[project.id] = project;
        return write(KEYS.projects, all);
    },
    remove(id) {
        const all = this.all();
        delete all[id];
        return write(KEYS.projects, all);
    },
    currentId() {
        return read(KEYS.currentProject, null);
    },
    setCurrent(id) {
        return write(KEYS.currentProject, id);
    }
};

// ===== Perfil del taller (para cotizaciones) =====
const DEFAULT_TALLER = {
    nombre: '', documento: '', telefono: '', email: '', direccion: '',
    logo: '', validezDias: 15, condiciones: 'Precios sujetos a variación sin previo aviso. Adelanto del 50% para iniciar el trabajo.'
};

export const tallerStore = {
    get() {
        return { ...DEFAULT_TALLER, ...read(KEYS.taller, {}) };
    },
    save(profile) {
        return write(KEYS.taller, profile);
    },
    nextQuoteNumber() {
        const n = (read(KEYS.quoteSeq, 0) || 0) + 1;
        write(KEYS.quoteSeq, n);
        return n;
    }
};
