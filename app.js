/* ==========================================================================
   ASADERO ORRANTE · app.js
   Motor de movimiento: GSAP + ScrollTrigger (scroll narrativo) + Lenis (scroll suave)
   y un canvas 2D propio para las brasas.

   Principios
   - Todo movimiento tiene un motivo: jerarquía, narrativa, feedback o transición.
   - Sin libs = sin romper: si GSAP/Lenis no cargan, la página queda completa y estática.
   - prefers-reduced-motion: sin preloader, sin pines, sin scrub, sin brasas animadas.
   ========================================================================== */

/* ==========================================================================
   CONFIGURACIÓN DEL NEGOCIO
   Es el ÚNICO lugar que hay que editar con los datos reales del cliente.
   Todo lo que se deje vacío se oculta o usa un texto neutro (no se inventan datos).
   ========================================================================== */
const CONFIG = {
    // Sucursales. Cada una recibe los pedidos en su propio WhatsApp.
    //   phone:   formato internacional sin "+", espacios ni guiones. México: 52 + 10 dígitos. Ejemplo: '526141234567'
    //   wa:      opcional. Enlace de WhatsApp de la sucursal (https://wa.me/message/...). Se usa cuando no hay "phone".
    //            Ese tipo de enlace no lleva el texto del pedido escrito; con "phone" sí.
    //   address: opcional. Ejemplo: 'Av. Principal 123, Col. Centro, Ciudad'
    //   maps:    opcional. Enlace de Google Maps de la sucursal.
    // Sin teléfono ni enlace "wa" la sucursal no recibe pedidos por WhatsApp, pero si tiene "maps" aparece en Contacto con su ubicación.
    // Con una sola sucursal de WhatsApp, los botones abren su WhatsApp directo; con dos o más, abren un selector de sucursal.
    branches: [
        { name: 'Santa Teresa',   phone: '', wa: 'https://wa.me/message/AT37LAXE42GYG1', address: 'Av. Munich 20526, Santa Teresa, 82090 Mazatlán, Sin.',               maps: 'https://maps.app.goo.gl/6mhzQsrkeW78oBV77' },
        { name: 'Santa Rosa',     phone: '', wa: 'https://wa.me/message/YLUORHJ27VBAA1', address: 'Av. Sta. Rosa 203, Burócratas, 82163 Mazatlán, Sin.',                 maps: 'https://maps.app.goo.gl/tvmYGEYAYsNUfpXv9' },
        { name: 'Real del Valle', phone: '', wa: 'https://wa.me/message/RHOAPYBT4UK7O1', address: 'Av. Paseo del Atlántico 4113, Real del Valle, 82124 Mazatlán, Sin.', maps: 'https://maps.app.goo.gl/miVXDajTn7BUJZbM6' }
    ],

    // Horario. Ejemplo: 'Lunes a domingo de 9:00 a 20:00'
    hours: '',

    // Redes sociales: URL completa. Las que queden vacías no se muestran.
    social: {
        instagram: '',
        facebook: '',
        tiktok: ''
    }
};

(() => {
    'use strict';

    const doc = document;
    const root = doc.documentElement;
    const $ = (sel, ctx = doc) => ctx.querySelector(sel);
    const $$ = (sel, ctx = doc) => Array.from(ctx.querySelectorAll(sel));

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
    const motionOK = hasGsap && !reduce;

    const state = { velocity: 0 };
    let lenis = null;
    let openPicker = null; // abre el selector de sucursal con un mensaje; solo existe si hay 2+ sucursales
    let cart = null;       // pedido (carrito): { count, summary, open }; lo crea initCart

    /* ----------------------------------------------------------------------
       Utilidades
       ---------------------------------------------------------------------- */
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const easeExpo = t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
    const safe = fn => {
        try { fn(); } catch (err) {
            console.error('[Orrante] fallo en', fn.name, err);
            root.classList.add('motion-fail'); // garantiza contenido visible si algo se rompe
        }
    };

    /* ----------------------------------------------------------------------
       WhatsApp, contacto y datos del negocio
       ---------------------------------------------------------------------- */
    const isPhone = p => /^\d{10,15}$/.test(p) && !/^(52)?0+$/.test(p);
    const hasWa = b => isPhone(b.phone) || /^https:\/\/wa\.me\//.test(b.wa || '');
    const named = CONFIG.branches.map((b, i) => ({ ...b, name: b.name || `Sucursal ${i + 1}` }));
    const branches = named.filter(hasWa);                              // reciben pedidos por WhatsApp
    const places = named.filter(b => b.maps || hasWa(b));              // se muestran en Contacto y footer
    const showPhone = p => (/^52\d{10}$/.test(p) ? `+52 ${p.slice(2, 5)} ${p.slice(5, 8)} ${p.slice(8)}` : `+${p}`);
    // Sin sucursal explícita usa la primera (los botones generales abren el selector si hay varias).
    // Con teléfono lleva el mensaje escrito; sin teléfono usa el enlace "wa" de la sucursal tal cual.
    const waLink = (msg, b = branches[0]) => {
        if (!b) return `https://wa.me/?text=${encodeURIComponent(msg)}`;
        return isPhone(b.phone) ? `https://wa.me/${b.phone}?text=${encodeURIComponent(msg)}` : b.wa;
    };

    function bindBusinessData() {
        if (!branches.length) {
            console.warn('[Orrante] Configura CONFIG.branches en app.js con el WhatsApp real de cada sucursal.');
        }
        $$('[data-wa]').forEach(a => { a.href = waLink(a.dataset.wa); });
        renderBranches();

        const set = (key, value) => {
            if (!value) return;
            $$(`[data-contact="${key}"]`).forEach(el => { el.textContent = value; });
        };
        set('hours', CONFIG.hours);

        let anySocial = false;
        Object.entries(CONFIG.social || {}).forEach(([net, url]) => {
            const a = $(`[data-social="${net}"]`);
            if (a && url) { a.href = url; a.hidden = false; anySocial = true; }
        });
        const wrap = $('[data-socials]');
        if (wrap && anySocial) wrap.hidden = false;

        const year = $('#year');
        if (year) year.textContent = new Date().getFullYear();
    }

    /* ----------------------------------------------------------------------
       Sucursales: lista en Contacto, enlaces en el footer y selector de sucursal
       ---------------------------------------------------------------------- */
    const SVG_NS = 'http://www.w3.org/2000/svg';

    function icon(id, cls = 'ic') {
        const svg = doc.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', cls);
        svg.setAttribute('aria-hidden', 'true');
        const use = doc.createElementNS(SVG_NS, 'use');
        use.setAttribute('href', `#${id}`);
        svg.appendChild(use);
        return svg;
    }

    // Enlace a una sucursal. "full" agrega la línea de ubicación y el teléfono (Contacto); sin "full" es la versión del selector.
    function branchLink(b, msg, full) {
        const a = doc.createElement('a');
        a.className = 'branch';
        a.href = waLink(msg, b);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        const ico = doc.createElement('span');
        ico.className = 'info__icon';
        ico.appendChild(icon('i-whatsapp-logo'));

        const txt = doc.createElement('span');
        txt.className = 'branch__txt';
        const name = doc.createElement('strong');
        name.textContent = b.name;
        txt.appendChild(name);
        const lines = full
            ? [b.address || 'Pídenos la ubicación por WhatsApp.', isPhone(b.phone) && showPhone(b.phone)].filter(Boolean)
            : [b.address].filter(Boolean);
        lines.forEach(line => {
            const s = doc.createElement('span');
            s.textContent = line;
            txt.appendChild(s);
        });

        a.append(ico, txt, icon('i-arrow-up-right', 'ic branch__go'));
        return a;
    }

    // Enlace a la ubicación de una sucursal en Google Maps. Sin "compact" es la tarjeta completa (sucursal que aún no tiene WhatsApp);
    // con "compact" es un enlace chico que acompaña a la tarjeta de WhatsApp.
    function mapLink(b, compact) {
        const a = doc.createElement('a');
        a.href = b.maps;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', `Ver la ubicación de ${b.name} en Google Maps${b.address ? `: ${b.address}` : ''}`);

        if (compact) {
            a.className = 'branch__map';
            a.append(icon('i-map-pin'), 'Ver ubicación en Maps');
            return a;
        }

        a.className = 'branch';
        const ico = doc.createElement('span');
        ico.className = 'info__icon';
        ico.appendChild(icon('i-map-pin'));

        const txt = doc.createElement('span');
        txt.className = 'branch__txt';
        const name = doc.createElement('strong');
        name.textContent = b.name;
        txt.appendChild(name);
        if (b.address) {
            const s = doc.createElement('span');
            s.textContent = b.address;
            txt.appendChild(s);
        }

        a.append(ico, txt, icon('i-arrow-up-right', 'ic branch__go'));
        return a;
    }

    function renderBranches() {
        if (!places.length) return; // sin datos reales se conservan los textos neutros del HTML
        const msg = 'Hola, quiero hacer un pedido en Asadero Orrante.';

        const wrap = $('[data-branches]');
        const list = $('[data-branch-list]');
        if (wrap && list) {
            places.forEach(b => {
                const li = doc.createElement('li');
                if (hasWa(b)) {
                    li.appendChild(branchLink(b, msg, true));
                    if (b.maps) li.appendChild(mapLink(b, true));
                } else {
                    li.appendChild(mapLink(b, false));
                }
                list.appendChild(li);
            });
            wrap.hidden = false;
            $$('[data-branch-fallback="map"]').forEach(el => { el.hidden = true; });
            if (branches.length) $$('[data-branch-fallback="wa"]').forEach(el => { el.hidden = true; });
        }

        const foot = $('[data-footer-branches]');
        if (foot && branches.length) {
            branches.forEach(b => {
                const a = doc.createElement('a');
                a.href = waLink(msg, b);
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = b.name;
                foot.appendChild(a);
            });
            foot.hidden = false;
        }

        const addr = $('.footer address');
        const withAddress = places.filter(b => b.address);
        if (addr && withAddress.length) {
            addr.replaceChildren(...withAddress.map(b => {
                const p = doc.createElement('p');
                const text = `${b.name}: ${b.address}`;
                if (b.maps) {
                    const a = doc.createElement('a');
                    a.href = b.maps;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.textContent = text;
                    p.appendChild(a);
                } else {
                    p.textContent = text;
                }
                return p;
            }));
        }
    }

    // Con 2+ sucursales, cualquier botón de WhatsApp abre este selector (y el formulario lo usa al enviar).
    function initPicker() {
        const dlg = $('#picker');
        const list = $('#picker-list');
        if (!dlg || !list || branches.length < 2 || typeof dlg.showModal !== 'function') return;

        openPicker = msg => {
            list.replaceChildren(...branches.map(b => {
                const li = doc.createElement('li');
                li.appendChild(branchLink(b, msg, false));
                return li;
            }));
            dlg.showModal();
            if (lenis) lenis.stop();
        };

        dlg.addEventListener('click', e => {
            if (e.target === dlg || e.target.closest('[data-picker-close]')) { dlg.close(); return; }
            if (e.target.closest('a.branch')) {
                toast('Abriendo WhatsApp con tu pedido.');
                dlg.close();
                const cartDlg = $('#cart'); // si venía del pedido, esa ventana también se cierra
                if (cartDlg && cartDlg.open) cartDlg.close();
            }
        });
        dlg.addEventListener('close', () => {
            const drawer = $('#drawer');
            if (lenis && !(drawer && drawer.classList.contains('is-open')) && !$('dialog[open]')) lenis.start();
        });

        doc.addEventListener('click', e => {
            const a = e.target.closest && e.target.closest('[data-wa]');
            if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            openPicker(a.dataset.wa);
        });
    }

    /* ----------------------------------------------------------------------
       Pedido (carrito): se arma con los botones "Lo quiero" y "+" (todo lo que tenga data-add)
       y se manda completo, con todos los productos, por WhatsApp.
       El nombre y el precio salen de lo que ya está escrito en la página: si cambia un precio en el HTML, el pedido lo sigue.
       ---------------------------------------------------------------------- */
    function initCart() {
        const dlg = $('#cart');
        const list = $('#cart-list');
        if (!dlg || !list) return;

        const KEY = 'orrante-pedido';
        const MAX_QTY = 99;
        const fab = $('#cart-fab');
        const countEl = $('#cart-count');
        const emptyEl = $('#cart-empty');
        const foot = $('#cart-foot');
        const totalEl = $('#cart-total');
        const noteEl = $('#cart-note');
        const clearBtn = $('#cart-clear');
        const formNote = $('[data-cart-note]');
        const canModal = typeof dlg.showModal === 'function';

        const money = n => `$${n.toLocaleString('es-MX')}`;
        const plural = n => `${n} ${n === 1 ? 'producto' : 'productos'}`;
        const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
        const priceOf = el => { const m = /\$\s*([\d.,]+)/.exec(text(el)); return m ? Number(m[1].replace(/,/g, '')) : null; };

        // Producto de un botón. data-add puede traer el nombre; si va vacío se toma del propio lugar donde está el botón.
        function productOf(btn) {
            const row = btn.closest('.plist li');
            const pkg = btn.closest('.pkg');
            const card = btn.closest('.pcard');
            let name = btn.dataset.add;
            let price = null;
            if (row) { name = name || text($('span', row)); price = priceOf($('b', row)); }
            else if (pkg) { name = name || text($('.pkg__name, .pkg__hot-title', pkg)); price = priceOf($('.pkg__price', pkg)); }
            else if (card) { name = name || text($('h3', card)); }
            return name ? { name, price } : null;
        }

        // Catálogo: nombre -> { name, price }. Si un mismo producto aparece en dos lugares, se queda el dato que trae precio.
        const catalog = new Map();
        $$('[data-add]').forEach(btn => {
            const p = productOf(btn);
            if (!p) return;
            const known = catalog.get(p.name);
            if (!known) catalog.set(p.name, p);
            else if (known.price == null && p.price != null) known.price = p.price;
        });

        // Pedido: nombre -> cantidad. Se conserva mientras la pestaña siga abierta (también si se recarga).
        const items = new Map();
        try {
            const saved = JSON.parse(sessionStorage.getItem(KEY) || '[]');
            if (Array.isArray(saved)) {
                saved.forEach(entry => {
                    const [name, qty] = Array.isArray(entry) ? entry : [];
                    const n = Math.min(MAX_QTY, Number(qty) | 0);
                    if (catalog.has(name) && n > 0) items.set(name, n);
                });
            }
        } catch (err) { /* sin almacenamiento: el pedido funciona igual, solo no se conserva al recargar */ }
        const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify([...items])); } catch (err) { /* idem */ } };

        const lines = () => [...items].map(([name, qty]) => {
            const { price } = catalog.get(name);
            return { name, qty, price, sub: price == null ? null : price * qty };
        });
        const totals = () => {
            const ls = lines();
            return {
                count: ls.reduce((n, l) => n + l.qty, 0),
                total: ls.reduce((t, l) => t + (l.sub || 0), 0),
                partial: ls.some(l => l.price == null)
            };
        };

        // Renglones del pedido para el mensaje de WhatsApp (los usa también el formulario)
        function summary() {
            const { total, partial } = totals();
            const out = lines().map(l => `• ${l.qty} x ${l.name}${l.sub == null ? '' : ` — ${money(l.sub)}`}`);
            if (total > 0) {
                out.push('', `*Total: ${money(total)}*`);
                if (partial) out.push('(sin contar los productos sin precio)');
            }
            return out;
        }
        const message = () => ['Hola, quiero hacer este pedido en Asadero Orrante:', '', ...summary(), '', '¡Gracias!'].join('\n');

        function stepButton(name, step) {
            const b = doc.createElement('button');
            b.type = 'button';
            b.dataset.name = name;
            b.dataset.step = String(step);
            b.setAttribute('aria-label', `${step > 0 ? 'Agregar uno más de' : 'Quitar uno de'} ${name}`);
            b.appendChild(icon(step > 0 ? 'i-plus' : 'i-minus'));
            return b;
        }

        function render() {
            const ls = lines();
            const { count, total, partial } = totals();

            list.replaceChildren(...ls.map(l => {
                const li = doc.createElement('li');
                li.className = 'cart__item';
                const name = doc.createElement('strong');
                name.textContent = l.name;
                const line = doc.createElement('b');
                line.className = 'cart__line';
                line.textContent = l.sub == null ? '' : money(l.sub);
                const unit = doc.createElement('span');
                unit.className = 'cart__unit';
                unit.textContent = l.price == null ? 'Precio por confirmar' : `${money(l.price)} c/u`;
                const qty = doc.createElement('div');
                qty.className = 'cart__qty';
                const num = doc.createElement('span');
                num.textContent = String(l.qty);
                qty.append(stepButton(l.name, -1), num, stepButton(l.name, 1));
                li.append(name, line, unit, qty);
                return li;
            }));
            list.hidden = !ls.length;
            emptyEl.hidden = ls.length > 0;
            foot.hidden = !ls.length;
            totalEl.textContent = money(total);
            totalEl.parentElement.hidden = total === 0;
            noteEl.hidden = !(partial && total > 0);

            if (fab) {
                fab.hidden = count === 0;
                countEl.textContent = String(count);
                fab.setAttribute('aria-label', `Ver mi pedido, ${plural(count)}`);
            }
            if (formNote) {
                formNote.hidden = count === 0;
                $('[data-cart-note-text]', formNote).textContent =
                    `Tu pedido (${plural(count)}${total > 0 ? `, ${money(total)}` : ''}) se manda junto con estos datos.`;
            }
        }

        function open() {
            if (!items.size || !canModal) return;
            clearTimer();
            render();
            dlg.showModal();
            if (lenis) lenis.stop();
        }

        function add(name) {
            const next = (items.get(name) || 0) + 1;
            if (next > MAX_QTY) { toast('Ya llevas el máximo de ese producto.'); return; }
            items.set(name, next);
            save();
            render();
            toast(`Agregado: ${name}${next > 1 ? ` (llevas ${next})` : ''}`);
            if (fab) {
                fab.classList.remove('is-bump');
                void fab.offsetWidth; // reinicia la animación si se toca varias veces seguidas
                fab.classList.add('is-bump');
            }
        }

        function step(name, delta) {
            const next = (items.get(name) || 0) + delta;
            if (next > MAX_QTY) return;
            if (next <= 0) items.delete(name); else items.set(name, next);
            save();
            render();
        }

        // Vaciar pide confirmar con un segundo toque
        let clearTimerId = 0;
        const clearTimer = () => { clearTimeout(clearTimerId); clearBtn.textContent = 'Vaciar pedido'; clearBtn.dataset.sure = ''; };

        function send() {
            if (!items.size) return;
            const msg = message();
            if (openPicker) { openPicker(msg); return; } // varias sucursales: primero se elige a cuál mandarlo
            window.open(waLink(msg), '_blank', 'noopener');
            toast('Abriendo WhatsApp con tu pedido.');
            if (dlg.open) dlg.close();
        }

        // Botones "Lo quiero" y "+"
        doc.addEventListener('click', e => {
            const btn = e.target.closest && e.target.closest('[data-add]');
            if (!btn) return;
            const p = productOf(btn);
            if (!p) return;
            if (!canModal) { window.open(waLink(`Hola, quiero pedir ${p.name}.`), '_blank', 'noopener'); return; } // navegador sin <dialog>: pedido directo
            add(p.name);
        });
        // Ver el pedido (botón flotante y aviso del formulario)
        doc.addEventListener('click', e => {
            if (e.target.closest && e.target.closest('[data-cart-open]')) open();
        });
        // Con productos en el pedido, los botones generales de WhatsApp abren el pedido en vez de mandar un saludo vacío.
        // Se registra antes que el selector de sucursal: aquel respeta los clics que ya se atendieron (defaultPrevented).
        doc.addEventListener('click', e => {
            const a = e.target.closest && e.target.closest('[data-wa]');
            if (!a || !items.size || !canModal || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            open();
        });

        dlg.addEventListener('click', e => {
            if (e.target === dlg || e.target.closest('[data-cart-close]')) { dlg.close(); return; }
            const b = e.target.closest('[data-step]');
            if (!b) return;
            const { name, step: s } = b.dataset;
            step(name, Number(s));
            // el renglón se vuelve a dibujar: el foco regresa al mismo botón (o al primero que quede)
            const again = $$('[data-step]', list).find(x => x.dataset.name === name && x.dataset.step === s) || $('[data-step]', list);
            (again || $('[data-cart-close]', dlg)).focus();
        });
        $('#cart-send').addEventListener('click', send);
        clearBtn.addEventListener('click', () => {
            if (clearBtn.dataset.sure) {
                clearTimer();
                items.clear();
                save();
                render();
                $('[data-cart-close]', dlg).focus();
                return;
            }
            clearBtn.dataset.sure = '1';
            clearBtn.textContent = '¿Seguro? Toca otra vez';
            clearTimerId = setTimeout(clearTimer, 3500);
        });
        dlg.addEventListener('close', () => {
            clearTimer();
            const drawer = $('#drawer');
            if (lenis && !(drawer && drawer.classList.contains('is-open')) && !$('dialog[open]')) lenis.start();
        });

        render();
        cart = { count: () => totals().count, summary, open };
    }

    /* ----------------------------------------------------------------------
       Partir texto en palabras (máscara para revelar, o palabra simple para scrub)
       Respeta elementos hijos (p. ej. <span class="grad">) y deja accesible el título.
       ---------------------------------------------------------------------- */
    function splitWords(el, { mask = true } = {}) {
        const label = el.textContent.replace(/\s+/g, ' ').trim();
        const isHeading = /^H[1-6]$/.test(el.tagName);

        const makeWord = text => {
            const outer = doc.createElement('span');
            if (mask) {
                outer.className = 'w';
                const inner = doc.createElement('span');
                inner.className = 'wi';
                inner.textContent = text;
                outer.appendChild(inner);
            } else {
                outer.className = 'mw';
                outer.textContent = text;
            }
            if (isHeading) outer.setAttribute('aria-hidden', 'true');
            return outer;
        };
        const walk = node => {
            Array.from(node.childNodes).forEach(child => {
                if (child.nodeType === Node.TEXT_NODE) {
                    const frag = doc.createDocumentFragment();
                    child.textContent.split(/(\s+)/).forEach(part => {
                        if (!part) return;
                        frag.appendChild(/^\s+$/.test(part) ? doc.createTextNode(' ') : makeWord(part));
                    });
                    child.replaceWith(frag);
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    child.classList.add('is-split');
                    walk(child);
                }
            });
        };
        walk(el);
        if (isHeading) el.setAttribute('aria-label', label);
        return $$(mask ? '.wi' : '.mw', el);
    }

    /* ----------------------------------------------------------------------
       Brasas: canvas 2D con sprites pre-renderizados y mezcla aditiva.
       Se pausa fuera de pantalla o con la pestaña oculta. El cursor las empuja.
       ---------------------------------------------------------------------- */
    class Embers {
        static sprites() {
            if (Embers._cache) return Embers._cache;
            const tones = [[255, 210, 122], [255, 176, 46], [247, 135, 31], [232, 86, 27]];
            Embers._cache = tones.map(([r, g, b]) => {
                const c = doc.createElement('canvas');
                c.width = c.height = 64;
                const x = c.getContext('2d');
                const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
                grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
                grad.addColorStop(0.28, `rgba(${r},${g},${b},.55)`);
                grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
                x.fillStyle = grad;
                x.fillRect(0, 0, 64, 64);
                return c;
            });
            return Embers._cache;
        }

        constructor(canvas, { count = 80, interactive = false } = {}) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.interactive = interactive;
            this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            this.sprites = Embers.sprites();
            this.mouse = { x: -9999, y: -9999 };
            this.boost = 0;
            this.visible = false;
            this.raf = 0;
            this.last = 0;
            this.w = 0;
            this.h = 0;
            this.resize();
            this.parts = Array.from({ length: count }, () => this.spawn(true));

            this.tick = now => {
                this.raf = 0;
                if (!this.visible || doc.hidden) return;
                const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
                this.last = now;
                this.boost = lerp(this.boost, clamp(Math.abs(state.velocity) * 0.05, 0, 2.6), 0.08);
                this.update(dt);
                this.draw();
                this.raf = requestAnimationFrame(this.tick);
            };

            if (reduce) { this.update(0.016); this.draw(); return; } // movimiento reducido: un fotograma estático
            new ResizeObserver(() => this.resize()).observe(canvas);
            new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.wake(); }).observe(canvas);
            doc.addEventListener('visibilitychange', () => this.wake());
            if (interactive && finePointer) {
                window.addEventListener('pointermove', e => {
                    const r = canvas.getBoundingClientRect();
                    this.mouse.x = e.clientX - r.left;
                    this.mouse.y = e.clientY - r.top;
                }, { passive: true });
            }
        }

        wake() {
            if (this.visible && !doc.hidden && !this.raf) {
                this.last = performance.now();
                this.raf = requestAnimationFrame(this.tick);
            }
        }

        resize() {
            const r = this.canvas.getBoundingClientRect();
            this.w = r.width;
            this.h = r.height;
            this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
            this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        }

        spawn(initial) {
            const h = this.h || 800;
            const vy = (22 + Math.random() * 64) * Math.max(0.7, h / 800);
            const ttl = (h / vy) * (0.55 + Math.random() * 0.6);
            const big = Math.random() < 0.18;
            return {
                x: Math.random() * (this.w || 1200),
                y: initial ? Math.random() * h : h + 24,
                vy, ttl,
                age: initial ? Math.random() * ttl * 0.6 : 0,
                sway: 8 + Math.random() * 34,
                freq: 0.5 + Math.random() * 1.3,
                phase: Math.random() * 6.28,
                flick: Math.random() * 6.28,
                size: big ? 26 + Math.random() * 22 : 7 + Math.random() * 14,
                tone: (Math.random() * 4) | 0,
                ox: 0, cx: 0
            };
        }

        update(dt) {
            const speed = 1 + this.boost;
            for (let i = 0; i < this.parts.length; i++) {
                const p = this.parts[i];
                p.age += dt;
                if (p.age >= p.ttl) { this.parts[i] = this.spawn(false); continue; }
                p.y -= p.vy * speed * dt;
                const sway = Math.sin(p.age * p.freq + p.phase) * p.sway;
                if (this.interactive) {
                    const dx = p.x + sway + p.ox - this.mouse.x;
                    const dy = p.y - this.mouse.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < 15876) {
                        const d = Math.sqrt(d2) || 1;
                        const f = (1 - d / 126) * 240 * dt;
                        p.ox += (dx / d) * f;
                        p.y += (dy / d) * f * 0.6;
                    }
                }
                p.ox *= 1 - dt * 0.6;
                p.cx = p.x + sway + p.ox;
            }
        }

        draw() {
            const { ctx } = this;
            ctx.clearRect(0, 0, this.w, this.h);
            ctx.globalCompositeOperation = 'lighter';
            for (const p of this.parts) {
                const t = p.age / p.ttl;
                const a = Math.min(1, p.age / 0.5) * (1 - t * t) * (0.65 + 0.35 * Math.sin(p.age * 9 + p.flick));
                if (a <= 0.01) continue;
                const s = p.size * (1 - t * 0.55);
                ctx.globalAlpha = Math.min(1, a);
                ctx.drawImage(this.sprites[p.tone], p.cx - s / 2, p.y - s / 2, s, s);
            }
            ctx.globalAlpha = 1;
        }
    }

    function initEmbers() {
        const small = window.innerWidth < 768;
        const hero = $('#embers-hero');
        const finale = $('#embers-finale');
        if (hero) new Embers(hero, { count: small ? 38 : 96, interactive: true });
        if (finale) new Embers(finale, { count: small ? 26 : 64 });
    }

    /* ----------------------------------------------------------------------
       Scroll suave (Lenis) + anclas
       ---------------------------------------------------------------------- */
    function initLenis() {
        if (!motionOK || typeof window.Lenis === 'undefined') return;
        lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.95, touchMultiplier: 1.35, smoothWheel: true });
        lenis.on('scroll', e => { state.velocity = e.velocity; window.ScrollTrigger.update(); });
        window.gsap.ticker.add(t => lenis.raf(t * 1000));
        window.gsap.ticker.lagSmoothing(0);
        lenis.stop(); // se libera cuando termina el preloader
    }

    function initAnchors(closeDrawer) {
        $$('a[href^="#"]').forEach(a => {
            a.addEventListener('click', e => {
                const id = a.getAttribute('href');
                if (!id || id.length < 2) return;
                const target = $(id);
                if (!target) return;
                e.preventDefault();
                closeDrawer();
                if (lenis) lenis.scrollTo(target, { offset: id === '#inicio' ? 0 : -8, duration: 1.8, easing: easeExpo });
                else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
                target.setAttribute('tabindex', '-1');
                target.focus({ preventScroll: true });
            });
        });
    }

    /* ----------------------------------------------------------------------
       Preloader: anillo de progreso real (imágenes + fuentes), contador y cortina
       ---------------------------------------------------------------------- */
    function runPreloader() {
        const pl = $('#preloader');
        if (!pl) return Promise.resolve();
        if (!motionOK) { pl.remove(); return Promise.resolve(); }

        const num = $('#pl-num');
        const ring = $('#pl-prog');
        const msg = $('#pl-msg');
        const messages = ['Encendiendo las brasas', 'Calentando la parrilla', 'Sazonando el fuego', 'Todo listo para ti'];
        const critical = $$('.hero img, .nav__brand img, .pl__mark');
        const tasks = critical.map(img => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()));
        tasks.push(doc.fonts && doc.fonts.ready ? doc.fonts.ready.catch(() => {}) : Promise.resolve());
        let done = 0;
        tasks.forEach(t => t.then(() => { done++; }));

        const MIN = 2000;
        const MAX = 8000;
        const t0 = performance.now();
        let shown = 0;
        let lastMsg = -1;

        return new Promise(resolve => {
            const frame = () => {
                const elapsed = performance.now() - t0;
                const target = Math.min(done / tasks.length, Math.min(1, elapsed / MIN));
                shown += (target - shown) * 0.1;
                if (elapsed > MAX) shown = 1;
                const pct = Math.min(100, Math.round(shown * 100));
                num.textContent = pct;
                ring.style.strokeDashoffset = String(100 - shown * 100);
                const idx = pct < 30 ? 0 : pct < 62 ? 1 : pct < 94 ? 2 : 3;
                if (idx !== lastMsg) { msg.textContent = messages[idx]; lastMsg = idx; }
                if (shown > 0.996) return finish();
                requestAnimationFrame(frame);
            };

            const finish = () => {
                num.textContent = '100';
                ring.style.strokeDashoffset = '0';
                const { gsap } = window;
                gsap.timeline({ onComplete: () => { pl.remove(); root.classList.add('is-ready'); } })
                    .to('.pl__core', { scale: 1.14, opacity: 0, duration: 0.7, ease: 'power3.in' }, '+=0.25')
                    .add(() => { if (lenis) lenis.start(); resolve(); }, '-=0.15')
                    .to('.pl__strips i', { yPercent: -101, duration: 1.15, ease: 'power4.inOut', stagger: { each: 0.09, from: 'center' } }, '-=0.1');
            };
            frame();
        });
    }

    /* ----------------------------------------------------------------------
       Hero: entrada orquestada + parallax de salida + inclinación 3D con el cursor
       ---------------------------------------------------------------------- */
    function heroIntro() {
        const { gsap } = window;
        const words = $$('.hero__title .wi');
        gsap.timeline({ defaults: { ease: 'expo.out' } })
            .fromTo('#nav', { yPercent: -125, y: 0 }, { yPercent: 0, y: 0, duration: 1.5 }, 0.3)
            .fromTo('.hero__bg', { scale: 1.22 }, { scale: 1, duration: 2.6, ease: 'power3.out' }, 0)
            .fromTo('.eyebrow[data-hero]', { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 1.1 }, 0.15)
            .fromTo(words, { yPercent: 112 }, { yPercent: 0, duration: 1.45, stagger: 0.085 }, 0.25)
            .fromTo('.hero__sub', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 1.2 }, 0.75)
            .fromTo('.hero__cta', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 1.2 }, 0.9)
            .fromTo('#stage', { opacity: 0, scale: 0.55, rotation: -28 }, { opacity: 1, scale: 1, rotation: 0, duration: 2.1 }, 0.2)
            .fromTo('.sat__img', { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(100% at 50% 50%)', duration: 1.3, stagger: 0.14, ease: 'power3.out' }, 1.0);
    }

    function initHeroScroll() {
        const { gsap } = window;
        gsap.to('.hero__copy', {
            yPercent: -9, opacity: 0.2, ease: 'none',
            scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 25%', scrub: true }
        });
        gsap.to('#stage', {
            yPercent: -14, ease: 'none',
            scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
        });
        // El plato gira y se aleja mientras el hero sale de pantalla (profundidad)
        gsap.to('#stage-tilt', {
            rotation: 32, scale: 0.84, ease: 'none',
            scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
        });
    }

    function initStageTilt() {
        if (!finePointer || reduce) return;
        const { gsap } = window;
        const tilt = $('#stage-tilt');
        const hero = $('.hero');
        const rx = gsap.quickTo(tilt, 'rotationX', { duration: 1.3, ease: 'power3.out' });
        const ry = gsap.quickTo(tilt, 'rotationY', { duration: 1.3, ease: 'power3.out' });
        hero.addEventListener('pointermove', e => {
            ry((e.clientX / window.innerWidth - 0.5) * 20);
            rx(-(e.clientY / window.innerHeight - 0.5) * 14);
        }, { passive: true });
        hero.addEventListener('pointerleave', () => { rx(0); ry(0); });
    }

    /* ----------------------------------------------------------------------
       Marquee: avanza solo y reacciona a la velocidad y dirección del scroll
       ---------------------------------------------------------------------- */
    function initMarquee() {
        const track = $('#marquee-track');
        const group = track && $('.marquee__group', track);
        if (!group) return;
        const build = () => {
            $$('.marquee__group', track).slice(1).forEach(g => g.remove());
            const w = group.offsetWidth;
            const copies = Math.ceil((window.innerWidth * 2) / Math.max(1, w)) + 1;
            for (let i = 0; i < copies; i++) track.appendChild(group.cloneNode(true));
            return w;
        };
        let width = build();
        if (!motionOK) return;
        const { gsap } = window;
        let x = 0;
        let dir = -1;
        let boost = 0;
        let visible = true;
        new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(track.parentElement);
        gsap.ticker.add((time, dt) => {
            if (!visible) return;
            boost = lerp(boost, state.velocity, 0.08);
            if (boost > 0.4) dir = -1;
            else if (boost < -0.4) dir = 1;
            x += dir * (70 + Math.abs(boost) * 22) * (dt / 1000);
            if (x <= -width) x += width;
            if (x > 0) x -= width;
            track.style.transform = `translate3d(${x.toFixed(2)}px,0,0) skewX(${clamp(-boost * 0.55, -9, 9).toFixed(2)}deg)`;
        });
        let rz;
        window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { width = build(); }, 200); });
    }

    /* ----------------------------------------------------------------------
       Manifiesto: las palabras se encienden con el scroll (narrativa de lectura)
       ---------------------------------------------------------------------- */
    function initManifesto() {
        const p = $('[data-scrub]');
        if (!p) return;
        const words = splitWords(p, { mask: false });
        window.gsap.fromTo(words, { opacity: 0.14 }, {
            opacity: 1, duration: 1, ease: 'none', stagger: 0.1,
            scrollTrigger: { trigger: p, start: 'top 82%', end: 'bottom 50%', scrub: true }
        });
    }

    /* ----------------------------------------------------------------------
       La brasa: la imagen se abre de tarjeta a pantalla completa con el scroll
       ---------------------------------------------------------------------- */
    function initZoom() {
        const { gsap } = window;
        const pin = $('.zoom__pin');
        if (!pin) return;
        const frame = $('.zoom__frame');
        const img = $('img', frame);
        const shade = $('.zoom__shade');
        const bgword = $('.zoom__bgword');
        const words = splitWords($('.zoom__title'));
        const rest = $$('.zoom__text, .zoom__content .btn');
        const small = window.innerWidth < 768 ? 'inset(24% 9% 26% 9% round 28px)' : 'inset(16% 28% 16% 28% round 28px)';
        const full = 'inset(0% 0% 0% 0% round 0px)';

        gsap.set('.zoom__content > *', { opacity: 1 });
        gsap.set(words, { yPercent: 112 });
        gsap.set(rest, { opacity: 0, y: 30 });

        gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: { trigger: pin, start: 'top top', end: '+=170%', scrub: 0.8, pin: true, anticipatePin: 1, invalidateOnRefresh: true }
        })
            .fromTo(bgword, { opacity: 0, scale: 0.78 }, { opacity: 1, scale: 1, duration: 0.3 }, 0)
            .fromTo(frame, { clipPath: small }, { clipPath: full, duration: 1, ease: 'power2.inOut' }, 0)
            .fromTo(img, { scale: 1.4 }, { scale: 1, duration: 1, ease: 'power2.inOut' }, 0)
            .to(bgword, { opacity: 0, scale: 1.35, duration: 0.55 }, 0.45)
            .to(shade, { opacity: 1, duration: 0.45 }, 0.55)
            .to(words, { yPercent: 0, duration: 0.5, stagger: 0.05, ease: 'power3.out' }, 0.78)
            .to(rest, { opacity: 1, y: 0, duration: 0.4, stagger: 0.12, ease: 'power3.out' }, 1.05)
            .to({}, { duration: 0.25 }, 1.45); // respiro final: la imagen completa se queda un instante
    }

    /* ----------------------------------------------------------------------
       Menú: el scroll vertical se convierte en recorrido horizontal (desktop).
       En móvil/tablet es un carrusel nativo con scroll-snap.
       ---------------------------------------------------------------------- */
    function initMenu() {
        const { gsap } = window;
        const mm = gsap.matchMedia();
        mm.add('(min-width: 1024px)', () => {
            const pin = $('.menu__pin');
            const track = $('#menu-track');
            const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
            const tween = gsap.to(track, {
                x: () => -dist(), ease: 'none',
                scrollTrigger: { trigger: pin, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1, anticipatePin: 1, invalidateOnRefresh: true }
            });
            gsap.fromTo('.menu__bar', { scaleX: 0 }, {
                scaleX: 1, ease: 'none',
                scrollTrigger: { trigger: pin, start: 'top top', end: () => '+=' + dist(), scrub: true, invalidateOnRefresh: true }
            });
            $$('.pcard').forEach(card => {
                gsap.fromTo($('.pcard__img', card), { xPercent: -5 }, {
                    xPercent: 5, ease: 'none',
                    scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true }
                });
            });
        });
    }

    /* ----------------------------------------------------------------------
       Revelados genéricos al entrar en pantalla
       ---------------------------------------------------------------------- */
    function initReveals() {
        const { gsap } = window;
        $$('[data-reveal]').forEach((el, i) => {
            gsap.fromTo(el, { opacity: 0, y: 48 }, {
                opacity: 1, y: 0, duration: 1.3, ease: 'expo.out', delay: (i % 3) * 0.08,
                scrollTrigger: { trigger: el, start: 'top 90%', once: true }
            });
        });
        $$('[data-split]:not([data-split="hero"]):not([data-split="manual"])').forEach(h => {
            const words = splitWords(h);
            gsap.fromTo(words, { yPercent: 112 }, {
                yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: 0.05,
                scrollTrigger: { trigger: h, start: 'top 88%', once: true }
            });
        });
        $$('.menu__lead, .menu__outro > *, .steps__aside > p, .steps__aside > .btn, .contact__lead, .contact__info > .info, .finale__text, .finale__copy > .btn, .menu__intro > .eyebrow, .contact__info > .eyebrow, .deals__head > .eyebrow, .gallery__head > .eyebrow, .deals__lead, .deals__tags, .deals__cta').forEach((el, i) => {
            gsap.fromTo(el, { opacity: 0, y: 30 }, {
                opacity: 1, y: 0, duration: 1.2, ease: 'expo.out',
                scrollTrigger: { trigger: el, start: 'top 92%', once: true }
            });
        });
    }

    /* ----------------------------------------------------------------------
       Pasos: las tarjetas se apilan; la anterior se encoge cuando llega la siguiente
       ---------------------------------------------------------------------- */
    function initSteps() {
        const { gsap } = window;
        const cards = $$('.step__card');
        cards.forEach((card, i) => {
            if (i === cards.length - 1) return;
            const next = cards[i + 1].closest('.step');
            gsap.to(card, {
                scale: 0.93, '--dim': 0.62, ease: 'none',
                scrollTrigger: { trigger: next, start: 'top 80%', end: 'top 28%', scrub: true }
            });
        });
    }

    /* ----------------------------------------------------------------------
       Cierre: el logo flota con parallax suave
       ---------------------------------------------------------------------- */
    function initFooter() {
        const giant = $('.footer__giant');
        if (!giant) return;
        window.gsap.fromTo(giant, { yPercent: 38, opacity: 0 }, {
            yPercent: 0, opacity: 1, ease: 'none',
            scrollTrigger: { trigger: '.footer', start: 'top 85%', end: 'bottom bottom', scrub: true }
        });
    }

    function initFinale() {
        const img = $('#finale-logo img');
        if (!img) return;
        window.gsap.fromTo(img, { yPercent: 7, scale: 0.94 }, {
            yPercent: -7, scale: 1.04, ease: 'none',
            scrollTrigger: { trigger: '.finale', start: 'top bottom', end: 'bottom top', scrub: true }
        });
    }

    /* ----------------------------------------------------------------------
       Navegación: estado "pegada", enlace activo y progreso de lectura
       ---------------------------------------------------------------------- */
    // Fondo de cristal del nav al salir de la cima. Sin dependencias, funciona en todos los modos.
    function initNavStuck() {
        const nav = $('#nav');
        const sentinel = doc.createElement('div');
        sentinel.setAttribute('aria-hidden', 'true');
        sentinel.style.cssText = 'position:absolute;top:60px;left:0;width:1px;height:1px;pointer-events:none';
        doc.body.prepend(sentinel);
        new IntersectionObserver(([e]) => nav.classList.toggle('is-stuck', !e.isIntersecting)).observe(sentinel);
    }

    function initNavState() {
        const { gsap, ScrollTrigger } = window;
        [['#menu', 'menu'], ['#paquetes', 'paquetes'], ['#fuego', 'fuego'], ['#pedir', 'pedir'], ['#contacto', 'contacto']].forEach(([sel, key]) => {
            const link = $(`.nav__links a[href="#${key}"]`);
            if (!link) return;
            ScrollTrigger.create({
                trigger: sel, start: 'top 55%', end: 'bottom 55%',
                onToggle: s => link.classList.toggle('is-active', s.isActive)
            });
        });
        gsap.to('.progress__bar', {
            scaleX: 1, ease: 'none',
            scrollTrigger: { trigger: root, start: 'top top', end: 'bottom bottom', scrub: 0.3 }
        });
    }

    /* ----------------------------------------------------------------------
       Menú móvil (drawer con reveal circular desde el botón)
       ---------------------------------------------------------------------- */
    function initDrawer() {
        const burger = $('#burger');
        const drawer = $('#drawer');
        const nav = $('#nav');
        if (!burger || !drawer) return () => {};
        const inertTargets = ['#contenido', '.footer', '.wa-float', '.cart-fab'].map(s => $(s)).filter(Boolean);
        let open = false;

        const center = () => {
            const r = burger.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        };
        const set = next => {
            if (next === open) return;
            open = next;
            burger.setAttribute('aria-expanded', String(open));
            burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
            drawer.inert = !open;
            nav.classList.toggle('is-open', open);
            inertTargets.forEach(el => { el.inert = open; });
            const { x, y } = center();
            const reach = Math.hypot(window.innerWidth, window.innerHeight);
            const closed = `circle(0px at ${x}px ${y}px)`;
            const opened = `circle(${reach}px at ${x}px ${y}px)`;

            if (open) {
                drawer.classList.add('is-open');
                if (lenis) lenis.stop();
                if (hasGsap) {
                    const { gsap } = window;
                    gsap.fromTo(drawer, { clipPath: closed }, { clipPath: opened, duration: reduce ? 0.01 : 0.95, ease: 'power4.inOut' });
                    gsap.fromTo($$('.drawer__link, .drawer__foot > *', drawer), { y: 44, opacity: 0 },
                        { y: 0, opacity: 1, duration: reduce ? 0.01 : 0.9, ease: 'expo.out', stagger: 0.07, delay: reduce ? 0 : 0.3 });
                } else {
                    drawer.style.clipPath = 'none';
                }
                const first = $('.drawer__link', drawer);
                if (first) setTimeout(() => first.focus({ preventScroll: true }), 350);
            } else {
                if (lenis) lenis.start();
                if (hasGsap) {
                    window.gsap.to(drawer, { clipPath: closed, duration: reduce ? 0.01 : 0.7, ease: 'power4.inOut', onComplete: () => drawer.classList.remove('is-open') });
                } else {
                    drawer.classList.remove('is-open');
                }
            }
        };
        burger.addEventListener('click', () => set(!open));
        doc.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { set(false); burger.focus(); } });
        window.addEventListener('resize', () => { if (open && window.innerWidth >= 768) set(false); });
        return () => set(false);
    }

    /* ----------------------------------------------------------------------
       Interacciones finas: luz en tarjetas y botones magnéticos
       ---------------------------------------------------------------------- */
    function initSpotlight() {
        if (!finePointer) return;
        let raf = 0;
        let last = null;
        doc.addEventListener('pointermove', e => {
            const el = e.target.closest && e.target.closest('[data-spot]');
            if (!el) return;
            last = { el, x: e.clientX, y: e.clientY };
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                const r = last.el.getBoundingClientRect();
                last.el.style.setProperty('--mx', `${last.x - r.left}px`);
                last.el.style.setProperty('--my', `${last.y - r.top}px`);
            });
        }, { passive: true });
    }

    function initMagnetic() {
        if (!finePointer || !motionOK) return;
        const { gsap } = window;
        $$('.magnetic').forEach(btn => {
            const xTo = gsap.quickTo(btn, 'x', { duration: 0.7, ease: 'power3.out' });
            const yTo = gsap.quickTo(btn, 'y', { duration: 0.7, ease: 'power3.out' });
            btn.addEventListener('pointerenter', e => {
                const r = btn.getBoundingClientRect();
                btn.style.setProperty('--x', `${e.clientX - r.left}px`);
                btn.style.setProperty('--y', `${e.clientY - r.top}px`);
            });
            btn.addEventListener('pointermove', e => {
                const r = btn.getBoundingClientRect();
                xTo((e.clientX - (r.left + r.width / 2)) * 0.28);
                yTo((e.clientY - (r.top + r.height / 2)) * 0.4);
            });
            btn.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
        });
    }

    /* ----------------------------------------------------------------------
       WhatsApp flotante: una invitación discreta, una sola vez
       ---------------------------------------------------------------------- */
    function initWaFloat() {
        const wa = $('#wa-float');
        if (!wa) return;
        setTimeout(() => {
            wa.classList.add('is-tip');
            setTimeout(() => wa.classList.remove('is-tip'), 5200);
        }, 9000);
    }

    /* ----------------------------------------------------------------------
       Formulario de pedido -> mensaje de WhatsApp
       ---------------------------------------------------------------------- */
    let toastTimer = 0;
    function toast(text) {
        const el = $('#toast');
        if (!el) return;
        el.textContent = text;
        el.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('is-on'), 3800);
    }

    function initForm() {
        const form = $('#pedido-form');
        if (!form) return;
        const nameInput = $('#f-nombre');
        const nameField = nameInput.closest('.field');
        const nameErr = $('#e-nombre');
        const chipField = $('#e-antojo').closest('.field');
        const chipErr = $('#e-antojo');
        const submit = $('#form-submit');
        const submitLabel = $('span', submit);
        const idleLabel = submitLabel.textContent;

        const setError = (field, node, text) => {
            field.classList.toggle('has-error', Boolean(text));
            node.textContent = text || '';
        };
        nameInput.addEventListener('input', () => setError(nameField, nameErr, ''));
        $$('input[name="antojo"]', form).forEach(i => i.addEventListener('change', () => setError(chipField, chipErr, '')));

        form.addEventListener('submit', e => {
            e.preventDefault();
            const nombre = nameInput.value.trim();
            const antojos = $$('input[name="antojo"]:checked', form).map(i => i.value);
            const personas = $('input[name="personas"]:checked', form).value;
            const notas = $('#f-notas').value.trim();

            setError(nameField, nameErr, nombre.length < 2 ? 'Dinos tu nombre para saber quién pide.' : '');
            const hasCart = Boolean(cart && cart.count() > 0); // con productos en el pedido ya no hace falta marcar un antojo
            setError(chipField, chipErr, antojos.length || hasCart ? '' : 'Elige al menos una opción del menú.');
            if (nombre.length < 2 || (!antojos.length && !hasCart)) {
                (nombre.length < 2 ? nameInput : $('input[name="antojo"]', form)).focus();
                toast('Revisa los campos marcados.');
                return;
            }

            const text = [
                'Hola, quiero hacer un pedido en Asadero Orrante.',
                '',
                `*Nombre:* ${nombre}`,
                ...(hasCart ? ['*Pedido:*', ...cart.summary(), ''] : []),
                ...(antojos.length ? [`*Se me antoja:* ${antojos.join(', ')}`] : []),
                `*Somos:* ${personas}`,
                `*Comentarios:* ${notas || 'Ninguno'}`,
                '',
                '¡Gracias!'
            ].join('\n');

            if (openPicker) { openPicker(text); return; } // varias sucursales: primero se elige a cuál mandarlo

            const url = waLink(text);
            const win = window.open(url, '_blank', 'noopener');
            if (!win) window.location.href = url; // si el navegador bloquea la ventana, vamos directo
            toast('Abriendo WhatsApp con tu pedido.');
            form.classList.add('is-sent');
            submitLabel.textContent = '¡Listo! Revisa WhatsApp';
            setTimeout(() => { form.classList.remove('is-sent'); submitLabel.textContent = idleLabel; }, 4200);
        });
    }

    /* ----------------------------------------------------------------------
       Arranque
       ---------------------------------------------------------------------- */
    function boot() {
        bindBusinessData();
        initCart(); // antes que el selector: sus clics en botones de WhatsApp tienen prioridad cuando hay pedido
        initPicker();
        initForm();
        initNavStuck();
        const closeDrawer = initDrawer();
        initAnchors(closeDrawer);
        initSpotlight();
        initWaFloat();

        if (!hasGsap) {
            // Sin GSAP: página completa y estática, con brasas y marquee simples.
            root.classList.remove('js');
            const pl = $('#preloader');
            if (pl) pl.remove();
            safe(initEmbers);
            safe(initMarquee);
            return;
        }

        window.gsap.registerPlugin(window.ScrollTrigger);
        window.ScrollTrigger.config({ ignoreMobileResize: true });

        if (!motionOK) {
            // Movimiento reducido: contenido estático, brasas en un solo fotograma.
            safe(initEmbers);
            safe(initMarquee);
            safe(initNavState);
            runPreloader();
            return;
        }

        initLenis();

        // El título del hero se parte antes del preloader y queda oculto tras la cortina.
        const heroTitle = $('[data-split="hero"]');
        if (heroTitle) window.gsap.set(splitWords(heroTitle), { yPercent: 112 });

        // Los ScrollTrigger se crean en el orden en que aparecen en la página.
        safe(initHeroScroll);
        safe(initMarquee);
        safe(initManifesto);
        safe(initZoom);
        safe(initMenu);
        safe(initReveals);
        safe(initSteps);
        safe(initFinale);
        safe(initFooter);
        safe(initNavState);

        runPreloader().then(() => {
            safe(initEmbers);
            safe(heroIntro);
            safe(initStageTilt);
            safe(initMagnetic);
        });

        const refresh = () => window.ScrollTrigger.refresh();
        window.addEventListener('load', refresh);
        if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(refresh);
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
