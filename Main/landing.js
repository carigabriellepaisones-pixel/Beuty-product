const qs = (sel, parent = document) => parent.querySelector(sel);
const qsa = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));

let cart = [];

function hideLoadingOverlay() {
    try {
        const overlay = qs('[data-loading-overlay]')
            || qs('#loadingOverlay')
            || qs('#loading-screen')
            || qs('#preloader')
            || qs('.loading-overlay')
            || qs('.loading-screen')
            || qs('.page-loader')
            || qs('.spinner-overlay')
            || qs('.loader');

        if (overlay) {
            overlay.style.display = 'none';
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
        document.body.classList.remove('is-loading');
    } catch {
        // ignore
    }
}

// Failsafe: never let a loader block the UI forever
window.setTimeout(hideLoadingOverlay, 2000);
window.setTimeout(hideLoadingOverlay, 3000);

window.addEventListener('error', () => {
    hideLoadingOverlay();
});

window.addEventListener('unhandledrejection', () => {
    hideLoadingOverlay();
});

const CART_KEY = 'jammaila_cart_v1';
const CHECKOUT_SNAPSHOT_KEY = 'jammaila_checkout_snapshot_v1';

const persistCart = () => {
    try {
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
        // ignore
    }
};

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

function initTermsModal() {
    const overlay = qs('#terms-modal');
    if (!overlay) return;

    const closeBtn = qs('.terms-close-btn', overlay);
    if (!closeBtn) return;

    const openModal = () => {
        overlay.classList.add('is-active');
        document.body.classList.add('is-modal-open');
    };

    const closeModal = () => {
        overlay.classList.remove('is-active');
        document.body.classList.remove('is-modal-open');
    };

    document.addEventListener('click', (e) => {
        const link = e.target && e.target.closest ? e.target.closest('.terms-link') : null;
        if (!link) return;
        e.preventDefault();
        openModal();
    });

    if (!overlay.dataset.bound) {
        overlay.dataset.bound = 'true';

        closeBtn.addEventListener('click', () => closeModal());

        overlay.addEventListener('click', (evt) => {
            if (evt.target === overlay) closeModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });
    }
}

function initSmoothScrollAnchors() {
    document.addEventListener('click', (e) => {
        const a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
        if (!a) return;

        const href = a.getAttribute('href') || '';
        if (href === '#' || href === '#top') return;
        if (a.hasAttribute('data-cart-open')) return;

        const id = href.slice(1);
        if (!id) return;
        const target = document.getElementById(id);
        if (!target) return;

        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function initCartDrawer() {
    const overlay = qs('#cart-sidebar-overlay');
    const closeBtn = qs('.cart-close-btn', overlay || document);
    const itemsContainer = qs('#cart-items-container', overlay || document);
    const countDisplay = qs('#cart-count-display', overlay || document);
    const totalPriceEl = qs('#cart-total-price', overlay || document);
    const badge = qs('[data-cart-badge]');
    const termsCheckbox = qs('#cart-terms-checkbox', overlay || document);
    const checkoutBtn = qs('.cart-checkout-btn', overlay || document);

    const openers = qsa('[data-cart-open]');

    const parsePriceToNumber = (value) => {
        if (typeof value === 'number') return value;
        const raw = String(value || '').replace(/[^0-9.]/g, '');
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
    };

    const formatCurrency = (n) => {
        const num = Number(n) || 0;
        return `₱ ${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const setOpen = (open) => {
        document.body.classList.toggle('cart-is-open', open);

        if (open && checkoutBtn) {
            checkoutBtn.disabled = true;
        }

        if (open && termsCheckbox) {
            termsCheckbox.checked = false;
        }
    };

    const getCartCount = () => cart.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

    const getCartTotal = () => cart.reduce((sum, it) => sum + (parsePriceToNumber(it.price) * (Number(it.qty) || 0)), 0);

    const persistCheckoutSnapshot = () => {
        try {
            const payload = {
                items: Array.isArray(cart) ? cart : [],
                subtotal: getCartTotal(),
                createdAt: new Date().toISOString()
            };
            localStorage.setItem(CHECKOUT_SNAPSHOT_KEY, JSON.stringify(payload));
        } catch {
            // ignore
        }
    };

    const renderCart = () => {
        if (badge) badge.textContent = String(getCartCount());
        if (countDisplay) countDisplay.textContent = String(getCartCount());
        if (totalPriceEl) totalPriceEl.textContent = formatCurrency(getCartTotal());

        if (!itemsContainer) return;
        itemsContainer.innerHTML = '';

        cart.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'cart-item';
            row.setAttribute('data-cart-id', String(item.id));

            row.innerHTML = `
                <div class="cart-item__thumb"><img src="${String(item.img || '')}" alt="${String(item.title || 'Product')}" /></div>
                <div class="cart-item__meta">
                    <h3 class="cart-item__title">${String(item.title || '')}</h3>
                    <div class="cart-item__price">${formatCurrency(parsePriceToNumber(item.price))}</div>
                    <div class="cart-item__qty" aria-label="Quantity selector">
                        <button type="button" class="qty-btn" data-cart-dec>−</button>
                        <input type="number" class="qty-input" value="${String(item.qty)}" min="1" readonly>
                        <button type="button" class="qty-btn" data-cart-inc>+</button>
                    </div>
                </div>
                <div class="cart-item__actions">
                    <button type="button" class="cart-remove-btn" data-cart-remove>Remove</button>
                </div>
            `;

            itemsContainer.appendChild(row);
        });
    };

    const addToCart = (product, qty = 1) => {
        const id = String(product?.id || '').trim() || String(Date.now());
        const title = String(product?.title || product?.name || '').trim();
        const img = String(product?.img || product?.imageUrl || '').trim();
        const price = parsePriceToNumber(product?.price);
        const amount = Math.max(1, Number(qty) || 1);

        const existing = cart.find((it) => String(it.id) === id);
        if (existing) {
            existing.qty = Math.max(1, (Number(existing.qty) || 0) + amount);
        } else {
            cart.push({ id, title, img, price, qty: amount });
        }

        persistCart();

        renderCart();
    };

    const removeFromCart = (id) => {
        cart = cart.filter((it) => String(it.id) !== String(id));
        persistCart();
        renderCart();
    };

    const setQty = (id, nextQty) => {
        const target = cart.find((it) => String(it.id) === String(id));
        if (!target) return;
        target.qty = Math.max(1, Number(nextQty) || 1);
        persistCart();
        renderCart();
    };

    if (overlay && !overlay.dataset.bound) {
        overlay.dataset.bound = 'true';

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) setOpen(false);
        });
    }

    if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.dataset.bound = 'true';
        closeBtn.addEventListener('click', () => setOpen(false));
    }

    if (openers.length) {
        openers.forEach((btn) => {
            if (btn.dataset.bound) return;
            btn.dataset.bound = 'true';
            btn.addEventListener('click', (e) => {
                if (btn.tagName === 'A') e.preventDefault();
                renderCart();
                setOpen(true);
            });
        });
    }

    if (termsCheckbox && checkoutBtn && !termsCheckbox.dataset.bound) {
        termsCheckbox.dataset.bound = 'true';
        checkoutBtn.disabled = true;
        termsCheckbox.addEventListener('change', () => {
            checkoutBtn.disabled = !termsCheckbox.checked;
        });

        checkoutBtn.addEventListener('click', () => {
            if (checkoutBtn.disabled) return;

            const validItems = Array.isArray(cart)
                ? cart.filter((it) => {
                    const qty = Number(it?.qty) || 0;
                    const title = String(it?.title || '').trim();
                    const id = String(it?.id || '').trim();
                    return title && id && Number.isFinite(qty) && qty > 0;
                })
                : [];

            if (!validItems.length) {
                showToast('Your cart is empty. Please add a product before checking out.');
                return;
            }

            persistCart();
            persistCheckoutSnapshot();
            window.location.href = new URL('checkout.html', window.location.href).href;
        });
    }

    if (itemsContainer && !itemsContainer.dataset.bound) {
        itemsContainer.dataset.bound = 'true';
        itemsContainer.addEventListener('click', (e) => {
            const row = e.target && e.target.closest ? e.target.closest('.cart-item[data-cart-id]') : null;
            if (!row) return;
            const id = row.getAttribute('data-cart-id');
            if (!id) return;

            const dec = e.target && e.target.closest ? e.target.closest('[data-cart-dec]') : null;
            if (dec) {
                const item = cart.find((it) => String(it.id) === String(id));
                if (!item) return;
                setQty(id, (Number(item.qty) || 1) - 1);
                return;
            }

            const inc = e.target && e.target.closest ? e.target.closest('[data-cart-inc]') : null;
            if (inc) {
                const item = cart.find((it) => String(it.id) === String(id));
                if (!item) return;
                setQty(id, (Number(item.qty) || 1) + 1);
                return;
            }

            const rm = e.target && e.target.closest ? e.target.closest('[data-cart-remove]') : null;
            if (rm) {
                removeFromCart(id);
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setOpen(false);
    });

    renderCart();

    if (checkoutBtn) checkoutBtn.disabled = true;

    window.__addToCart = addToCart;
    window.__renderCart = renderCart;
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

function initHeroSlider() {
    const slides = qsa('.heroBanner__slide');
    if (slides.length <= 1) return;

    let idx = slides.findIndex((el) => el.classList.contains('is-active'));
    if (idx < 0) idx = 0;

    const setActive = (nextIdx) => {
        slides.forEach((el, i) => el.classList.toggle('is-active', i === nextIdx));
    };

    window.setInterval(() => {
        idx = (idx + 1) % slides.length;
        setActive(idx);
    }, 7000);
}

function initShopTabs() {
    const tabs = qs('.shopTabs');
    const track = qs('.shopTabs__track', tabs || document);
    const indicator = qs('.shopTabs__indicator', tabs || document);
    if (!tabs || !track || !indicator) return;

    const normalizeCategory = (value) => {
        const v = String(value || '').trim().toLowerCase();
        if (v === 'all') return 'all';
        if (v === 'individual' || v === 'set' || v === 'package') return v;
        return '';
    };

    const primaryRail = qs('#primary-product-rail');
    const secondaryRail = qs('#secondary-product-rail');

    const getButtons = () => qsa('.shopTabs__btn[data-target]', track);

    const setIndicatorToButton = (btn) => {
        if (!btn) return;
        indicator.style.width = `${btn.offsetWidth}px`;
        indicator.style.transform = `translateX(${btn.offsetLeft}px)`;
    };

    const applyFilterToRail = (railTrack, target) => {
        if (!railTrack) return;
        const cards = qsa('.pCard[data-category]', railTrack);
        const normalizedTarget = normalizeCategory(target);

        if (normalizedTarget === 'all') {
            cards.forEach((card) => card.classList.remove('is-hidden'));
            return;
        }

        cards.forEach((card) => {
            const cat = normalizeCategory(card.getAttribute('data-category'));
            card.classList.toggle('is-hidden', normalizedTarget && cat !== normalizedTarget);
        });
    };

    const applyFilterEverywhere = (target) => {
        applyFilterToRail(primaryRail, target);
        applyFilterToRail(secondaryRail, target);

        if (typeof window.__syncSliderControls === 'function') {
            window.__syncSliderControls();
        }
    };

    const setActiveTab = (btn) => {
        const target = normalizeCategory(btn?.getAttribute('data-target'));
        if (!target) return;
        getButtons().forEach((b) => b.classList.toggle('is-active', b === btn));
        setIndicatorToButton(btn);
        applyFilterEverywhere(target);
    };

    const applyActive = () => {
        const active = getButtons().find((b) => b.classList.contains('is-active'));
        if (active) setActiveTab(active);
    };

    track.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('.shopTabs__btn[data-target]') : null;
        if (!btn) return;
        setActiveTab(btn);
    });

    const first = getButtons().find((b) => b.classList.contains('is-active')) || getButtons()[0];
    if (first) setActiveTab(first);

    window.addEventListener('resize', () => {
        const active = getButtons().find((b) => b.classList.contains('is-active'));
        if (active) setIndicatorToButton(active);
    });

    window.__applyShopTabsFilter = applyActive;
    window.__recalcShopTabsIndicator = () => {
        const active = getButtons().find((b) => b.classList.contains('is-active'));
        if (active) setIndicatorToButton(active);
    };
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

function initStorefrontProducts() {
    const API_BASE_URL_RAW = window.APP_CONFIG?.API_BASE_URL;
    if (!API_BASE_URL_RAW || !String(API_BASE_URL_RAW).trim()) {
        throw new Error('Missing API_BASE_URL in config.js');
    }

    const API_BASE_URL = String(API_BASE_URL_RAW).trim().replace(/\/+$/, '');

    const PRODUCT_PLACEHOLDER =
        'data:image/svg+xml;charset=UTF-8,' +
        encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
                <rect width="100%" height="100%" fill="#f2eee9"/>
                <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="28" fill="#777">
                    No product image
                </text>
            </svg>`
        );

    const loadStorefrontProducts = async () => {
        const res = await fetch(`${API_BASE_URL}/api/products`);
        if (!res.ok) {
            throw new Error(`Unable to load products: ${res.status}`);
        }
        const payload = await res.json().catch(() => null);
        const products = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.products)
                ? payload.products
                : [];
        return Array.isArray(products) ? products : [];
    };

    const getProductImageUrl = (product) => {
        const rawImage = String(
            product?.image_url ||
            product?.imageUrl ||
            product?.image ||
            ''
        ).trim();

        if (!rawImage || rawImage === 'NULL') return PRODUCT_PLACEHOLDER;
        if (/^https?:\/\//i.test(rawImage)) return rawImage;
        if (rawImage.startsWith('/uploads/')) return `${API_BASE_URL}${rawImage}`;
        if (rawImage.startsWith('uploads/')) return `${API_BASE_URL}/${rawImage}`;
        return rawImage;
    };

    const primaryTrack = qs('#primary-product-rail');
    const secondaryTrack = qs('#secondary-product-rail');
    if (!primaryTrack && !secondaryTrack) return;

    const viewport1 = qs('#viewport-layer-1');
    const viewport2 = qs('#viewport-layer-2');
    const dots1 = qs('#dots-layer-1');
    const dots2 = qs('#dots-layer-2');

    const arrowLeft1 = qs('.shop-section[data-product-rail-layer="1"] .rail-arrow--left');
    const arrowRight1 = qs('.shop-section[data-product-rail-layer="1"] .rail-arrow--right');
    const arrowLeft2 = qs('.shop-section[data-product-rail-layer="2"] .rail-arrow--left');
    const arrowRight2 = qs('.shop-section[data-product-rail-layer="2"] .rail-arrow--right');

    const STEP = 300;

    const setupSliderControls = (viewportEl, dotsContainerEl, leftArrow, rightArrow) => {
        if (!viewportEl || !dotsContainerEl) return;

        const getSlidesCount = () => {
            const cards = qsa('.pCard:not(.is-hidden)', viewportEl);
            if (!cards.length) return 0;
            const viewportW = Math.max(1, viewportEl.clientWidth);
            const first = cards[0];
            const cardW = Math.max(1, first.getBoundingClientRect().width);
            const styles = window.getComputedStyle(first.parentElement);
            const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
            const perView = Math.max(1, Math.floor((viewportW + gap) / (cardW + gap)));
            return Math.max(1, Math.ceil(cards.length / perView));
        };

        const setArrowState = () => {
            const maxScrollLeft = viewportEl.scrollWidth - viewportEl.clientWidth;
            const atStart = viewportEl.scrollLeft <= 1;
            const atEnd = viewportEl.scrollLeft >= maxScrollLeft - 1;

            if (leftArrow) leftArrow.classList.toggle('is-disabled', atStart || maxScrollLeft <= 1);
            if (rightArrow) rightArrow.classList.toggle('is-disabled', atEnd || maxScrollLeft <= 1);
        };

        const setActiveDot = () => {
            const dots = qsa('.carousel-dot', dotsContainerEl);
            if (!dots.length) return;
            const idx = Math.max(0, Math.min(dots.length - 1, Math.round(viewportEl.scrollLeft / STEP)));
            dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
        };

        const rebuildDots = () => {
            const count = getSlidesCount();
            dotsContainerEl.innerHTML = '';
            if (count <= 1) {
                setArrowState();
                return;
            }

            for (let i = 0; i < count; i += 1) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'carousel-dot' + (i === 0 ? ' is-active' : '');
                btn.setAttribute('aria-label', `Go to slide ${i + 1}`);
                btn.addEventListener('click', () => {
                    viewportEl.scrollTo({ left: i * STEP, behavior: 'smooth' });
                });
                dotsContainerEl.appendChild(btn);
            }

            setArrowState();
            setActiveDot();
        };

        if (leftArrow && !leftArrow.dataset.bound) {
            leftArrow.dataset.bound = 'true';
            leftArrow.addEventListener('click', () => {
                viewportEl.scrollBy({ left: -STEP, behavior: 'smooth' });
            });
        }

        if (rightArrow && !rightArrow.dataset.bound) {
            rightArrow.dataset.bound = 'true';
            rightArrow.addEventListener('click', () => {
                viewportEl.scrollBy({ left: STEP, behavior: 'smooth' });
            });
        }

        if (!viewportEl.dataset.bound) {
            viewportEl.dataset.bound = 'true';
            viewportEl.addEventListener('scroll', () => {
                window.requestAnimationFrame(() => {
                    setArrowState();
                    setActiveDot();
                });
            });
        }

        window.addEventListener('resize', () => {
            rebuildDots();
        });

        rebuildDots();
        return { rebuildDots };
    };

    const badge = qs('[data-cart-badge]');
    const bumpBadge = () => {
        if (!badge || !badge.animate) return;
        badge.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
            { duration: 220, easing: 'ease-out' }
        );
    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const formatPrice = (n) => {
        const num = typeof n === 'string' ? Number(n) : Number(n);
        if (!Number.isFinite(num)) return `₱ ${escapeHtml(n)}`;
        return `₱ ${num.toLocaleString('en-PH')}`;
    };

    const readProducts = (key) => {
        try {
            const raw = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(raw) ? raw : [];
        } catch {
            return [];
        }
    };

    const writeProducts = (key, list) => {
        try {
            localStorage.setItem(key, JSON.stringify(Array.isArray(list) ? list : []));
        } catch {
            // ignore
        }
    };

    const normalizeProductForUi = (p) => {
        const product = p && typeof p === 'object' ? p : {};
        const isActive =
            product?.isActive === true ||
            String(product?.isActive || '').trim().toLowerCase() === 'true' ||
            product?.active === true ||
            String(product?.active || '').trim().toLowerCase() === 'true';

        const storefrontLayerRaw = product?.storefrontLayer ?? product?.storefront_layer;
        const storefrontLayerParsed = Number(storefrontLayerRaw);
        const storefrontLayer = storefrontLayerParsed === 2 ? 2 : 1;

        return {
            ...product,
            isActive,
            storefrontLayer,
            type: String(product?.type || product?.productType || product?.product_type || '').toUpperCase(),
            stock: Number.isFinite(Number(product?.stock)) ? Number(product?.stock) : product?.stock,
        };
    };

    const pickTag = (p) => {
        const t = String(p?.type || '').toUpperCase();
        if (t === 'BUNDLE') return 'FREE GIFT';
        if (Number(p?.stock) === 0) return 'LIMITED';
        return 'NEW IN';
    };

    const pickCategory = (p) => {
        const explicit = String(p?.category || '').trim().toLowerCase();
        if (explicit === 'individual' || explicit === 'set' || explicit === 'package') return explicit;
        const t = String(p?.type || '').toUpperCase();
        if (t === 'BUNDLE') return 'set';
        if (t === 'PACKAGE') return 'package';
        return 'individual';
    };

    const renderInto = (trackEl, storageKey, shouldApplyTabs) => {
        if (!trackEl) return;
        const products = readProducts(storageKey);
        trackEl.innerHTML = '';
        if (!products.length) {
            if (shouldApplyTabs) {
                if (typeof window.__applyShopTabsFilter === 'function') {
                    window.__applyShopTabsFilter();
                }
                if (typeof window.__recalcShopTabsIndicator === 'function') {
                    window.__recalcShopTabsIndicator();
                }
            }
            return;
        }

        products.slice(0, 12).forEach((product) => {
            const img = getProductImageUrl(product);
            const title = String(product?.name || 'Product');
            const price = formatPrice(product?.price);
            const tag = String(pickTag(product));
            const id = String(product?.id || '');
            const category = pickCategory(product);
            const description = String(product?.description ?? '').trim();
            const usageInstructions = String(
                product?.usageInstructions ??
                product?.usage_instructions ??
                ''
            ).trim();
            const productType = String(
                product?.type ??
                product?.productType ??
                product?.product_type ??
                ''
            ).trim();
            const includes = String(
                product?.includes ??
                product?.bundleIncludes ??
                product?.bundle_includes ??
                product?.packageIncludes ??
                product?.package_includes ??
                ''
            ).trim();

            const card = document.createElement('article');
            card.className = 'pCard';
            card.setAttribute('aria-label', 'Product card');
            card.setAttribute('data-product-id', id);
            card.setAttribute('data-category', category);
            card.setAttribute('data-description', description);
            card.setAttribute('data-usage', usageInstructions);
            card.setAttribute('data-includes', includes);
            card.setAttribute('data-product-type', productType);
            card.setAttribute('data-price', String(product?.price ?? ''));
            card.setAttribute('data-title', title);
            card.setAttribute('data-img', img);

            card.innerHTML = `
                <div class="pCard__media">
                    <span class="pBadge">Trending</span>
                    <button class="pHeart" type="button" aria-label="Add to favorites" data-heart>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 21s-7-4.4-9.2-8.7C1.2 9.2 3.1 6 6.7 6c2 0 3.3 1.1 4 2 0.7-0.9 2-2 4-2 3.6 0 5.5 3.2 3.9 6.3C19 16.6 12 21 12 21Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <img class="pCard__img" alt="${escapeHtml(title)}" src="${escapeHtml(img)}" data-placeholder="${escapeHtml(PRODUCT_PLACEHOLDER)}" onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
                </div>
                <div class="pCard__body">
                    <div class="pTag">${escapeHtml(tag)}</div>
                    <h3 class="pTitle">${escapeHtml(title)}</h3>
                    <div class="pPrice">${price}</div>
                </div>
                <button class="pCta" type="button" data-add-bag>ADD TO BAG</button>
            `;

            trackEl.appendChild(card);
        });

        if (shouldApplyTabs) {
            if (typeof window.__applyShopTabsFilter === 'function') {
                window.__applyShopTabsFilter();
            }
            if (typeof window.__recalcShopTabsIndicator === 'function') {
                window.__recalcShopTabsIndicator();
            }
        }
    };

    const bindTrack = (trackEl) => {
        if (!trackEl) return;
        trackEl.addEventListener('click', (e) => {
            const add = e.target && e.target.closest ? e.target.closest('[data-add-bag]') : null;
            if (add) {
                const card = e.target && e.target.closest ? e.target.closest('.pCard') : null;
                if (!card || typeof window.__addToCart !== 'function') return;
                window.__addToCart({
                    id: card.getAttribute('data-product-id'),
                    title: card.getAttribute('data-title') || (qs('.pTitle', card)?.textContent || ''),
                    img: card.getAttribute('data-img') || (qs('.pCard__img', card)?.getAttribute('src') || ''),
                    price: card.getAttribute('data-price') || (qs('.pPrice', card)?.textContent || 0)
                }, 1);
                showToast('Added to Bag!');
                return;
            }

            const heart = e.target && e.target.closest ? e.target.closest('[data-heart]') : null;
            if (heart) {
                heart.classList.toggle('is-active');
                return;
            }

            const card = e.target && e.target.closest ? e.target.closest('.pCard') : null;
            if (!card) return;

            const overlay = qs('#product-modal');
            const closeBtn = qs('.modal-close-btn', overlay || document);
            const imgEl = qs('#modal-product-img', overlay || document);
            const titleEl = qs('#modal-product-title', overlay || document);
            const priceEl = qs('#modal-product-price', overlay || document);
            const descEl = qs('#modal-product-desc', overlay || document);
            const usageEl = qs('#modal-product-usage', overlay || document);
            const includesSection = qs('#modal-product-includes-section', overlay || document);
            const includesHeading = qs('#modal-product-includes-heading', overlay || document);
            const includesEl = qs('#modal-product-includes', overlay || document);
            const qtyInput = qs('.qty-input', overlay || document);
            const minusBtn = qs('.qty-minus', overlay || document);
            const plusBtn = qs('.qty-plus', overlay || document);
            const submitBtn = qs('.modal-submit-btn', overlay || document);

            if (!overlay || !imgEl || !titleEl || !priceEl || !descEl || !usageEl || !qtyInput || !minusBtn || !plusBtn || !submitBtn || !closeBtn) return;

            const openModal = () => {
                const cardImg = qs('.pCard__img', card);
                const cardTitle = qs('.pTitle', card);
                const cardPrice = qs('.pPrice', card);

                imgEl.setAttribute('src', String(cardImg?.getAttribute('src') || ''));
                imgEl.setAttribute('alt', String(cardTitle?.textContent || 'Product Detail'));
                titleEl.textContent = String(cardTitle?.textContent || '');
                priceEl.textContent = String(cardPrice?.textContent || '');

                const desc = String(card.getAttribute('data-description') || '').trim();
                const usage = String(card.getAttribute('data-usage') || '').trim();
                const includes = String(card.getAttribute('data-includes') || '').trim();
                const productType = String(card.getAttribute('data-product-type') || '').trim();
                const category = String(card.getAttribute('data-category') || '').trim();

                descEl.textContent = desc || 'No description available.';
                usageEl.textContent = usage || 'No usage instructions available.';

                if (includesSection) includesSection.hidden = true;
                if (includesEl) includesEl.textContent = '';

                const normalizedType = productType.toLowerCase();
                const normalizedCategory = category.toLowerCase();
                const supportsIncludes =
                    normalizedCategory === 'package' ||
                    normalizedCategory === 'set' ||
                    normalizedType.includes('bundle') ||
                    normalizedType.includes('package') ||
                    normalizedType.includes('set');

                if (includesSection && includesEl && includes && supportsIncludes) {
                    includesEl.textContent = includes;

                    if (includesHeading) {
                        if (normalizedCategory === 'package' || normalizedType.includes('package')) {
                            includesHeading.textContent = 'PACKAGE INCLUDES';
                        } else if (normalizedCategory === 'set' || normalizedType.includes('bundle')) {
                            includesHeading.textContent = 'BUNDLE INCLUDES';
                        } else if (normalizedType.includes('set')) {
                            includesHeading.textContent = 'SET INCLUDES';
                        } else {
                            includesHeading.textContent = 'PACKAGE INCLUDES';
                        }
                    }

                    includesSection.hidden = false;
                }

                overlay.dataset.productId = String(card.getAttribute('data-product-id') || '');
                overlay.dataset.productTitle = String(cardTitle?.textContent || '');
                overlay.dataset.productImg = String(cardImg?.getAttribute('src') || '');
                overlay.dataset.productPrice = String(card.getAttribute('data-price') || cardPrice?.textContent || '0');

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
                    if (typeof window.__addToCart === 'function') {
                        window.__addToCart({
                            id: overlay.dataset.productId,
                            title: overlay.dataset.productTitle,
                            img: overlay.dataset.productImg,
                            price: overlay.dataset.productPrice
                        }, qty);
                    }

                    showToast('Added to Bag!');

                    const prev = submitBtn.textContent;
                    submitBtn.textContent = 'ADDED';
                    window.setTimeout(() => {
                        submitBtn.textContent = prev;
                    }, 900);
                });
            }

            openModal();
        });
    };

    bindTrack(primaryTrack);
    bindTrack(secondaryTrack);

    window.addEventListener('storage', (e) => {
        if (e.key === 'storeProducts') renderInto(primaryTrack, 'storeProducts', true);
        if (e.key === 'storeProductsLayer2') renderInto(secondaryTrack, 'storeProductsLayer2', false);
    });

    const syncControls = () => {
        setupSliderControls(viewport1, dots1, arrowLeft1, arrowRight1);
        setupSliderControls(viewport2, dots2, arrowLeft2, arrowRight2);
    };

    window.__syncSliderControls = syncControls;

    const hydrateFromApiIfNeeded = () => {
        loadStorefrontProducts()
            .then((list) => {
                const normalized = (Array.isArray(list) ? list : [])
                    .map(normalizeProductForUi)
                    .filter((p) => p && typeof p === 'object')
                    .filter((p) => p.isActive !== false);

                const layer1 = normalized.filter((p) => Number(p?.storefrontLayer) !== 2);
                const layer2 = normalized.filter((p) => Number(p?.storefrontLayer) === 2);

                writeProducts('storeProducts', layer1);
                writeProducts('storeProductsLayer2', layer2);

                renderInto(primaryTrack, 'storeProducts', true);
                renderInto(secondaryTrack, 'storeProductsLayer2', true);
                syncControls();
            })
            .catch((err) => {
                console.error('[storefront] Failed to load products:', err);
                renderInto(primaryTrack, 'storeProducts', true);
                renderInto(secondaryTrack, 'storeProductsLayer2', true);
                syncControls();
            });
    };

    hydrateFromApiIfNeeded();

    if (typeof window.__applyShopTabsFilter === 'function') {
        window.__applyShopTabsFilter();
    }
}

function initProductRail() {
    // Navigation arrows removed in the new HTML structure.
    // Viewports use native horizontal scrolling.
}

document.addEventListener('DOMContentLoaded', () => {
    const safeInit = (fn) => {
        try {
            fn();
        } catch (err) {
            console.error('[landing] init crash:', err);
            hideLoadingOverlay();
        }
    };

    safeInit(initYear);
    safeInit(initNav);
    safeInit(initHeroSlider);
    safeInit(initShopTabs);
    safeInit(initThumbGallery);
    safeInit(initVariants);
    safeInit(initQuantityAndBag);
    safeInit(initCartDrawer);
    safeInit(initSmoothScrollAnchors);
    safeInit(initTermsModal);
    safeInit(initStorefrontProducts);
    safeInit(initProductRail);

    hideLoadingOverlay();
});
