const qs = (sel, parent = document) => parent.querySelector(sel);
const qsa = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));

function showToast(text = 'Added to Bag!') {
    const el = document.createElement('div');
    el.className = 'toast-notification';
    el.textContent = String(text);
    document.body.appendChild(el);

    window.requestAnimationFrame(() => {
        el.classList.add('active');
    });

    window.setTimeout(() => {
        el.classList.remove('active');
        window.setTimeout(() => {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        }, 420);
    }, 2500);
}

function initYear() {
    const yearEl = qs('[data-year]');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}

function initNav() {
    const toggle = qs('.nav__toggle');
    const menu = qs('.nav__center[data-collapsible]');
    if (!toggle || !menu) return;

    const setOpen = (open) => {
        toggle.classList.toggle('is-open', open);
        menu.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    toggle.addEventListener('click', () => {
        setOpen(!toggle.classList.contains('is-open'));
    });

    qsa('.nav__link', menu).forEach((link) => {
        link.addEventListener('click', () => setOpen(false));
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setOpen(false);
    });
}

function initThumbGallery() {
    const mainImg = qs('[data-main-image]');
    const thumbs = qsa('[data-thumb-src]');
    if (!mainImg || thumbs.length === 0) return;

    const setActiveThumb = (btn) => {
        thumbs.forEach((t) => t.classList.toggle('is-active', t === btn));
    };

    thumbs.forEach((btn) => {
        btn.addEventListener('click', () => {
            const nextSrc = btn.getAttribute('data-thumb-src');
            if (!nextSrc || nextSrc === mainImg.getAttribute('src')) {
                setActiveThumb(btn);
                return;
            }

            setActiveThumb(btn);
            mainImg.classList.add('is-fading');
            window.setTimeout(() => {
                mainImg.setAttribute('src', nextSrc);
                mainImg.classList.remove('is-fading');
            }, 140);
        });
    });
}

function initVariants() {
    const label = qs('[data-variant-label]');
    const swatches = qsa('.swatch[data-variant]');
    if (!label || swatches.length === 0) return;

    swatches.forEach((btn) => {
        btn.addEventListener('click', () => {
            swatches.forEach((b) => b.classList.toggle('is-active', b === btn));
            const name = String(btn.getAttribute('data-variant') || '').trim();
            if (name) label.textContent = name;
        });
    });
}

function initQuantityAndBag() {
    const badge = qs('[data-cart-badge]');
    const dec = qs('[data-qty-dec]');
    const inc = qs('[data-qty-inc]');
    const valueEl = qs('[data-qty-value]');
    const addBtn = qs('[data-add-to-bag]');
    if (!badge || !dec || !inc || !valueEl || !addBtn) return;

    let qty = Number(valueEl.textContent) || 1;
    let bag = Number(badge.textContent) || 0;

    const renderQty = () => {
        qty = Math.max(1, Math.min(99, qty));
        valueEl.textContent = String(qty);
        dec.disabled = qty <= 1;
    };

    const bumpBadge = () => {
        badge.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
            { duration: 220, easing: 'ease-out' }
        );
    };

    const renderBag = () => {
        badge.textContent = String(bag);
        bumpBadge();
    };

    dec.addEventListener('click', () => {
        qty -= 1;
        renderQty();
    });

    inc.addEventListener('click', () => {
        qty += 1;
        renderQty();
    });

    addBtn.addEventListener('click', () => {
        bag += qty;
        renderBag();

        const prev = addBtn.textContent;
        addBtn.textContent = 'Added';
        window.setTimeout(() => {
            addBtn.textContent = prev;
        }, 900);
    });

    renderQty();
    renderBag();
}

function initProductRail() {
    const rail = qs('[data-product-rail]');
    if (!rail) return;

    const viewport = qs('[data-rail-viewport]', rail);
    const track = qs('[data-rail-track]', rail);
    const prev = qs('[data-rail-prev]', rail);
    const next = qs('[data-rail-next]', rail);
    if (!viewport || !track || !prev || !next) return;

    const setDisabled = (btn, disabled) => {
        btn.disabled = disabled;
        btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    };

    const getStep = () => {
        const firstCard = track.querySelector('.pCard');
        if (!firstCard) return viewport.clientWidth;

        const cardRect = firstCard.getBoundingClientRect();
        const styles = window.getComputedStyle(track);
        const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
        return cardRect.width + gap;
    };

    const updateNav = () => {
        const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
        const atStart = viewport.scrollLeft <= 1;
        const atEnd = viewport.scrollLeft >= maxScrollLeft - 1;

        setDisabled(prev, atStart || maxScrollLeft <= 1);
        setDisabled(next, atEnd || maxScrollLeft <= 1);
    };

    prev.addEventListener('click', () => {
        viewport.scrollBy({ left: -getStep(), behavior: 'smooth' });
    });

    next.addEventListener('click', () => {
        viewport.scrollBy({ left: getStep(), behavior: 'smooth' });
    });

    viewport.addEventListener('scroll', () => {
        window.requestAnimationFrame(updateNav);
    });

    window.addEventListener('resize', updateNav);
    updateNav();
}

function initProductModal() {
    const overlay = qs('#product-modal');
    if (!overlay) return;

    const closeBtn = qs('.modal-close-btn', overlay);
    const imgEl = qs('#modal-product-img', overlay);
    const titleEl = qs('#modal-product-title', overlay);
    const priceEl = qs('#modal-product-price', overlay);
    const descEl = qs('#modal-product-desc', overlay);
    const qtyInput = qs('.qty-input', overlay);
    const minusBtn = qs('.qty-minus', overlay);
    const plusBtn = qs('.qty-plus', overlay);
    const submitBtn = qs('.modal-submit-btn', overlay);
    const badge = qs('[data-cart-badge]');

    if (!closeBtn || !imgEl || !titleEl || !priceEl || !descEl || !qtyInput || !minusBtn || !plusBtn || !submitBtn) return;

    const openModal = (card) => {
        const cardImg = qs('.pCard__img', card);
        const cardTitle = qs('.pTitle', card);
        const cardPrice = qs('.pPrice', card);

        imgEl.setAttribute('src', String(cardImg?.getAttribute('src') || ''));
        imgEl.setAttribute('alt', String(cardTitle?.textContent || 'Product Detail'));
        titleEl.textContent = String(cardTitle?.textContent || '');
        priceEl.textContent = String(cardPrice?.textContent || '');

        const desc = String(card.getAttribute('data-description') || '').trim();
        descEl.textContent = desc || 'A clean, elevated ritual designed to leave skin feeling balanced, comfortable, and softly radiant.';

        qtyInput.value = '1';
        overlay.classList.add('is-active');
        document.body.classList.add('is-modal-open');
    };

    const closeModal = () => {
        overlay.classList.remove('is-active');
        document.body.classList.remove('is-modal-open');
    };

    if (!overlay.dataset.bound) {
        overlay.dataset.bound = 'true';

        closeBtn.addEventListener('click', () => closeModal());

        overlay.addEventListener('click', (evt) => {
            if (evt.target === overlay) closeModal();
        });

        minusBtn.addEventListener('click', () => {
            const current = Number(qtyInput.value) || 1;
            qtyInput.value = String(Math.max(1, current - 1));
        });

        plusBtn.addEventListener('click', () => {
            const current = Number(qtyInput.value) || 1;
            qtyInput.value = String(Math.max(1, current + 1));
        });

        submitBtn.addEventListener('click', () => {
            const qty = Math.max(1, Number(qtyInput.value) || 1);
            if (badge) {
                const current = Number(badge.textContent) || 0;
                badge.textContent = String(current + qty);
                if (typeof badge.animate === 'function') {
                    badge.animate(
                        [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
                        { duration: 220, easing: 'ease-out' }
                    );
                }
            }

            showToast('Added to Bag!');

            const prev = submitBtn.textContent;
            submitBtn.textContent = 'ADDED';
            window.setTimeout(() => {
                submitBtn.textContent = prev;
            }, 900);
        });
    }

    document.addEventListener('click', (e) => {
        const add = e.target && e.target.closest ? e.target.closest('[data-add-bag],[data-add-to-bag]') : null;
        if (add) return;

        const heart = e.target && e.target.closest ? e.target.closest('[data-heart]') : null;
        if (heart) return;

        const card = e.target && e.target.closest ? e.target.closest('.pCard') : null;
        if (!card) return;

        openModal(card);
    });
}

initYear();
initNav();
initThumbGallery();
initVariants();
initQuantityAndBag();
initProductRail();