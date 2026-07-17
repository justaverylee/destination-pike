/**
 * SDAweb Calendar Sync — instant view/navigation swap (v0.12.0, #brief-sections-3,6,7).
 *
 * Single ES module. No imports, no framework, no jQuery. Modern browser
 * APIs only — gated by feature checks where availability isn't guaranteed.
 *
 * Pure progressive enhancement: every link this module intercepts is a
 * real, fully-functional anchor with an `href` that works without
 * JavaScript. The script makes navigation feel instant; nothing breaks
 * when it doesn't load. Modifier-clicks (Cmd/Ctrl/Shift) pass through
 * to the browser's native open-in-new-tab behaviour.
 *
 * Per-root state lives in a WeakMap so multiple calendar instances on
 * one page (e.g. front-page Forsiden list + Bunnlinjen widget) don't
 * cross-contaminate AbortControllers, prefetch caches, or focus restoration.
 *
 * @since 0.12.0
 */

const cfg = window.SdawebGcalSwap || {};
const reducedMotion = window.matchMedia
	? window.matchMedia( '( prefers-reduced-motion: reduce )' ).matches
	: false;
const saveData = !! ( navigator.connection && navigator.connection.saveData );
const supportsViewTransitions = typeof document.startViewTransition === 'function';

/**
 * Debug logging — gated by either `window.SdawebGcalSwap.debug = true` set
 * before the module loads, or the URL query parameter
 * `?sdaweb_gcal_swap_debug=1` on the current page. Both routes flip on the
 * same diagnostic stream so an admin can inspect the boot/initRoot/click
 * chain without modifying any code.
 *
 * The query-param route is more convenient in practice — paste the param
 * into the address bar, reload, read the console. Cleared by removing the
 * param.
 */
function debugEnabled() {
	if ( cfg.debug === true ) {
		return true;
	}
	try {
		const usp = new URLSearchParams( window.location.search );
		return usp.get( 'sdaweb_gcal_swap_debug' ) === '1';
	} catch ( e ) {
		return false;
	}
}
const debug = debugEnabled();
function dlog() {
	if ( ! debug ) {
		return;
	}
	const prefix = '[sdaweb-gcal-swap]';
	// eslint-disable-next-line no-console
	console.log.apply( console, [ prefix ].concat( Array.from( arguments ) ) );
}
dlog( 'module loaded · cfg.endpoint=', cfg.endpoint, '· document.readyState=', document.readyState );

/**
 * Per-root state map: AbortController + LRU prefetch cache. WeakMap so
 * removing a root from the DOM lets the state get garbage-collected.
 *
 * @type {WeakMap<HTMLElement, { abort: AbortController|null, prefetch: Map<string, Promise<object>> }>}
 */
const roots = new WeakMap();

const VIEW_CLASS_PATTERN = /\bsdaweb-gcal--(list|month|card|week|day|mini|upcoming)\b/g;
const PREFETCH_CAP = 6;

/**
 * Initialise every calendar root the renderer marked as swap-enabled.
 * The `data-sdaweb-gcal-swap-enabled="1"` attribute is the opt-in: only
 * roots that explicitly carry it participate. The renderer emits this
 * attribute when the display's `enable_instant_view_swap` feature flag
 * is on; everything else stays on full-page navigation.
 */
function boot() {
	dlog( 'boot() called' );
	if ( ! cfg.endpoint ) {
		dlog( 'boot bailed: cfg.endpoint is empty.', 'cfg=', cfg );
		return; // No endpoint configured — bail silently.
	}
	const targets = document.querySelectorAll(
		'.sdaweb-gcal[data-sdaweb-gcal-id][data-sdaweb-gcal-swap-enabled="1"]'
	);
	dlog( 'boot found targets:', targets.length, Array.from( targets ) );
	if ( debug ) {
		// Cross-check: count ALL .sdaweb-gcal roots vs the swap-enabled subset.
		// Pinpoints whether the swap-enabled attribute is the filter
		// excluding roots, vs roots not being on the page at all.
		const allRoots = document.querySelectorAll( '.sdaweb-gcal[data-sdaweb-gcal-id]' );
		dlog( 'cross-check · total .sdaweb-gcal roots on page:', allRoots.length,
			'· of those, swap-enabled:', targets.length );
		for ( const root of allRoots ) {
			dlog( '  root', root, '· data-sdaweb-gcal-swap-enabled=', root.getAttribute( 'data-sdaweb-gcal-swap-enabled' ) );
		}
	}
	for ( const root of targets ) {
		// Confirm the view-toggle/nav anchors the click delegate is supposed
		// to catch are actually descendants of this root. If the count is 0,
		// the listener will never fire — the anchors are siblings or live
		// outside the root.
		if ( debug ) {
			const togglesInside = root.querySelectorAll(
				'a.sdaweb-gcal-view-toggle__btn, a[data-sdaweb-gcal-view-toggle], a[data-sdaweb-gcal-nav]'
			);
			dlog( 'root', root, '· view-toggle/nav anchors inside:', togglesInside.length, Array.from( togglesInside ) );
		}
		initRoot( root );
	}
}

/**
 * Wire one calendar root. Click listener catches view-toggle buttons +
 * any anchor the renderer flagged as `[data-sdaweb-gcal-nav]` (prev/next
 * navigation). Listeners are added once per root; the root is the
 * delegation surface so dynamically-inserted swap targets (after a swap
 * applies new HTML) still work without re-wiring.
 *
 * @param {HTMLElement} root Calendar root element.
 */
function initRoot( root ) {
	if ( roots.has( root ) ) {
		dlog( 'initRoot skipped (already initialised):', root );
		return;
	}
	roots.set( root, { abort: null, prefetch: new Map() } );

	root.addEventListener( 'click', ( event ) => {
		const link = findSwapLink( event.target );
		dlog( 'click · target=', event.target, '· closest match=', link );
		if ( ! link ) {
			dlog( 'click bailed: no view-toggle/nav anchor in target ancestry' );
			return;
		}
		// Honour native open-in-new-tab modifiers + non-primary clicks.
		// The user's intent is to leave this tab alone; let the browser
		// follow the href as normal.
		if ( event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 ) {
			dlog( 'click bailed: modifier or non-primary button — letting browser navigate natively' );
			return;
		}
		event.preventDefault();
		dlog( 'click intercepted · preventDefault called · href was', link.href );
		const params = parseLinkIntent( link, root );
		if ( ! params ) {
			dlog( 'parseLinkIntent returned null — falling back to window.location.href' );
			window.location.href = link.href;
			return;
		}
		swap( root, params, { pushHistory: true } );
	} );
	dlog( 'initRoot attached click + prefetch listeners to', root );

	// Hover + keyboard-focus prefetch. Speculatively fetch the swap target
	// when a visitor hovers or tabs to a view-toggle/nav link, so the click
	// (which usually follows within ~200-2000ms) completes against a warm
	// cache. Skipped under Save-Data, and wrapped in requestIdleCallback so
	// the prefetch never competes with user-driven work.
	root.addEventListener( 'pointerenter', schedulePrefetch, true );
	root.addEventListener( 'focusin', schedulePrefetch, true );
}

/**
 * Speculatively fetch the swap target for a hovered/focused link and stash
 * the in-flight promise in the per-root prefetch Map. Idempotent — repeat
 * triggers on the same link reuse the existing promise instead of
 * launching a second fetch. LRU-evicted at PREFETCH_CAP.
 *
 * Failures swallow silently (the prefetch is best-effort; click-time fetch
 * gets a fresh chance) so a network blip during hover doesn't break the
 * subsequent commit.
 *
 * @param {Event} event pointerenter or focusin event.
 */
function schedulePrefetch( event ) {
	if ( saveData ) {
		return;
	}
	const link = findSwapLink( event.target );
	if ( ! link ) {
		return;
	}
	const root = link.closest( '.sdaweb-gcal[data-sdaweb-gcal-swap-enabled="1"]' );
	if ( ! root ) {
		return;
	}
	const state = roots.get( root );
	if ( ! state ) {
		return;
	}
	const params = parseLinkIntent( link, root );
	if ( ! params ) {
		return;
	}
	const key = paramKey( params );
	if ( state.prefetch.has( key ) ) {
		return; // Already in flight or stashed.
	}

	const idle = window.requestIdleCallback || function ( cb ) {
		return setTimeout( cb, 1 );
	};

	idle( function () {
		// Re-check inside the idle callback in case a competing prefetch
		// claimed this key while we were waiting for idle time.
		if ( state.prefetch.has( key ) ) {
			return;
		}
		const promise = fetch( buildEndpointUrl( params ), {
			headers: { Accept: 'application/json' },
			credentials: 'same-origin',
		} ).then( function ( response ) {
			if ( ! response.ok ) {
				throw new Error( 'HTTP ' + response.status );
			}
			return response.json();
		} ).catch( function ( err ) {
			// Drop the failed prefetch from the cache so the next click
			// triggers a fresh fetch with the loading shimmer. Re-throw
			// so a consumer awaiting this promise (via prefetch-hit in
			// fetchView) sees the rejection and swap()'s catch handles
			// the fallback — returning `null` here previously caused
			// applySwap to crash on `data.html`.
			state.prefetch.delete( key );
			throw err;
		} );

		state.prefetch.set( key, promise );

		// LRU evict: Map iteration order is insertion order, so deleting
		// the first key removes the oldest entry. Caps the prefetch cache
		// at PREFETCH_CAP so an admin user hovering across every toggle
		// doesn't pile up unbounded promises.
		if ( state.prefetch.size > PREFETCH_CAP ) {
			const oldest = state.prefetch.keys().next().value;
			state.prefetch.delete( oldest );
		}
	} );
}

/**
 * Walk up from the click target to find the nearest swap-eligible anchor.
 * Returns null for clicks that aren't on a swap target — e.g. event-detail
 * links, which must remain full-page navigation so visitors actually leave
 * the calendar to the event's URL.
 *
 * @param {EventTarget} target Click event target.
 * @returns {HTMLAnchorElement|null}
 */
function findSwapLink( target ) {
	if ( ! ( target instanceof Element ) ) {
		return null;
	}
	return target.closest( 'a[data-sdaweb-gcal-nav], a[data-sdaweb-gcal-view-toggle], a.sdaweb-gcal-view-toggle__btn' );
}

/**
 * Parse the link's href to extract the parameters we'll send to the
 * REST endpoint. Pulls `sdaweb_gcal_view` and `sdaweb_gcal_focus` from
 * the query string — those are the same params the server-rendered
 * full-page navigation uses, so the two paths share canonical URLs.
 *
 * Returns null when the link doesn't carry enough info to route a swap.
 *
 * @param {HTMLAnchorElement} link Link element.
 * @param {HTMLElement}       root Owning calendar root.
 * @returns {{slug:string, view:string, anchor_date:string, instance:string}|null}
 */
function parseLinkIntent( link, root ) {
	let url;
	try {
		url = new URL( link.href, window.location.origin );
	} catch ( e ) {
		return null;
	}
	const view = url.searchParams.get( 'sdaweb_gcal_view' );
	const focus = url.searchParams.get( 'sdaweb_gcal_focus' );
	// The link's `?sdaweb_gcal_id=` query param is the authoritative
	// source for the saved-display slug — it's the same value the
	// server-rendered full-page navigation uses. Falls back to the root's
	// data-sdaweb-gcal-id only when the URL doesn't carry it (defensive;
	// every server-rendered toggle/nav anchor we emit DOES carry it).
	//
	// Earlier 0.12.x builds incorrectly used `root.dataset.sdawebGcalId`
	// as the slug, but that attribute holds the synthesised DOM
	// instance id (e.g. `sdaweb-gcal-f89d077028f0` from build_display_id())
	// not the saved-display slug. The REST endpoint correctly rejected
	// it as an unknown display → 400 → swap fell back to native nav.
	// Diagnosed live on stavdal.me 0.12.4.
	const slug = url.searchParams.get( 'sdaweb_gcal_id' ) || root.dataset.sdawebGcalId || '';
	if ( ! slug || ! view ) {
		return null;
	}
	return {
		slug,
		view,
		anchor_date: focus || '',
		// `instance` stays the root's DOM identifier — it's how the
		// popstate handler finds the right root when restoring on
		// back/forward. Distinct from `slug` (which goes to the REST
		// endpoint as the saved-display lookup key).
		instance: root.dataset.sdawebGcalId || slug,
	};
}

/**
 * Build the REST endpoint URL for a given param set.
 *
 * @param {{slug:string, view:string, anchor_date:string}} params Swap params.
 * @returns {string}
 */
function buildEndpointUrl( params ) {
	const url = new URL( cfg.endpoint, window.location.origin );
	url.searchParams.set( 'slug', params.slug );
	url.searchParams.set( 'view', params.view );
	if ( params.anchor_date ) {
		url.searchParams.set( 'anchor_date', params.anchor_date );
	}
	if ( params.instance ) {
		url.searchParams.set( 'instance', params.instance );
	}
	// v0.12.6: send the current page URL so the server-rendered partial's
	// toggle/nav anchor hrefs are built against the page, not against the
	// REST endpoint. window.location.href is captured at fetch time (not
	// at module-load time) so client-side router pushes that happened
	// before the click are reflected. Same-origin enforcement happens
	// server-side; a cross-origin URL gets reset to '' there.
	url.searchParams.set( 'page_url', window.location.href );
	return url.toString();
}

/**
 * Stable cache key for the per-root prefetch map. Identical params hash
 * to the same key; ordering of object keys doesn't matter because we
 * build it from fixed-order fields.
 *
 * @param {object} params Swap params.
 * @returns {string}
 */
function paramKey( params ) {
	return params.slug + '|' + params.view + '|' + ( params.anchor_date || '' );
}

/**
 * Update the page URL to reflect the new view without reloading. Picks
 * up the link's full canonical URL when possible — the renderer's nav
 * links are already canonical — so back/forward replays match what
 * full-page navigation would produce.
 *
 * @param {{slug:string, view:string, anchor_date:string}} params Swap params.
 * @returns {string}
 */
function updatePageUrl( params ) {
	const url = new URL( window.location.href );
	url.searchParams.set( 'sdaweb_gcal_view', params.view );
	if ( params.anchor_date ) {
		url.searchParams.set( 'sdaweb_gcal_focus', params.anchor_date );
	} else {
		url.searchParams.delete( 'sdaweb_gcal_focus' );
	}
	url.searchParams.set( 'sdaweb_gcal_id', params.slug );
	return url.toString();
}

/**
 * Build the URL to fall back to when the swap fails. Mirrors the
 * canonical URL the renderer would emit — same query params the
 * server-side view-toggle navigation uses — so the browser lands on
 * the same view it would have without JS.
 *
 * @param {{slug:string, view:string, anchor_date:string}} params Swap params.
 * @returns {string}
 */
function buildFallbackUrl( params ) {
	return updatePageUrl( params );
}

/**
 * Execute a swap. Single chokepoint — every code path (click, popstate)
 * goes through this so AbortController + loading-state + history are
 * managed in one place.
 *
 * @param {HTMLElement} root   Calendar root.
 * @param {object}      params Swap params.
 * @param {object}      opts   { pushHistory: boolean }.
 */
async function swap( root, params, opts ) {
	const state = roots.get( root );
	if ( ! state ) {
		return;
	}

	// Cancel any in-flight swap. Rapid clicks across multiple toggles
	// should never paint stale results.
	if ( state.abort ) {
		state.abort.abort();
	}
	state.abort = new AbortController();

	const started = performance.now();
	setLoadingState( root, true );

	try {
		const data = await fetchView( params, state );

		const apply = () => applySwap( root, data );

		// v0.13.3: `document.startViewTransition(apply)` schedules the
		// callback as an async task — without an await, the code below
		// runs against the OLD DOM. Listener scripts re-binding on
		// `sdaweb-gcal:viewchanged` would then attach to the old
		// (about-to-be-destroyed) wrapper and skip the new one.
		// `updateCallbackDone` resolves after the callback (and therefore
		// the innerHTML replace) has run, so the post-swap operations
		// below see the new DOM in both code paths.
		if ( ! reducedMotion && supportsViewTransitions ) {
			const transition = document.startViewTransition( apply );
			await transition.updateCallbackDone;
		} else {
			apply();
		}

		if ( opts.pushHistory ) {
			const url = updatePageUrl( params );
			history.pushState( { sdaweb: params }, '', url );
		}

		announceToScreenReader( root, data );
		moveFocusToHeading( root );

		root.dispatchEvent( new CustomEvent( 'sdaweb-gcal:viewchanged', {
			bubbles: true,
			detail: { view: data.view, anchor_date: data.anchor_date },
		} ) );

		if ( debug ) {
			console.log( '[sdaweb-gcal] swap ok', params, Math.round( performance.now() - started ) + 'ms' );
		}
	} catch ( err ) {
		if ( err && err.name === 'AbortError' ) {
			return;
		}
		if ( debug ) {
			console.warn( '[sdaweb-gcal] swap failed, falling back to full nav', err );
		}
		window.location.href = buildFallbackUrl( params );
	} finally {
		setLoadingState( root, false );
	}
}

/**
 * Fetch a view's HTML from the REST endpoint. Reuses an in-flight
 * prefetch promise when one exists for the same params — the common
 * case after hover/focus prefetch lands ahead of the click.
 *
 * @param {object}         params Swap params.
 * @param {object}         state  Per-root state.
 * @returns {Promise<object>} Parsed JSON response.
 */
async function fetchView( params, state ) {
	const key = paramKey( params );
	if ( state.prefetch.has( key ) ) {
		const cached = state.prefetch.get( key );
		state.prefetch.delete( key ); // single-use; refetch on next miss.
		return await cached;
	}
	const url = buildEndpointUrl( params );
	const response = await fetch( url, {
		signal: state.abort.signal,
		headers: { Accept: 'application/json' },
		credentials: 'same-origin',
	} );
	if ( ! response.ok ) {
		throw new Error( 'HTTP ' + response.status );
	}
	return await response.json();
}

/**
 * Apply a successful response: replace inner HTML, update view modifier
 * class, refresh data-sdaweb-gcal-view attribute. The outer element's
 * identity (and any event listeners attached to it) is preserved.
 *
 * @param {HTMLElement} root Calendar root.
 * @param {object}      data REST response.
 */
function applySwap( root, data ) {
	if ( ! data || typeof data.html !== 'string' ) {
		// Defensive: should never reach here on the happy path because
		// fetchView throws on HTTP error and swap()'s catch handles it.
		// But a prefetched promise that resolved to a malformed body
		// could land here — bail gracefully instead of crashing.
		dlog( 'applySwap bailed: payload missing or has no .html field', data );
		return;
	}
	root.innerHTML = data.html;

	// Purge stale event-hover JSON islands left over from the full page load.
	//
	// The page-load render emits the hover-data island as a sibling of this
	// root (and, for Month view with mobile_degrade="auto", the swap response
	// is the whole `.sdaweb-gcal-month-with-fallback` wrapper, which
	// extract_inner_html can't strip — so root.innerHTML nests the fresh island
	// deep inside `root`). Either way the swap injects a *fresh* island inside
	// `root`, but the original page-load island survives OUTSIDE it. With two
	// islands sharing one data-display-id, event-hover.js's rebuildRegistry()
	// (last-write-wins over every island in document order) lets the stale
	// outside island — last in the document — overwrite the fresh payload, so
	// hovers on the new month's chips find no event data, showFor() bails before
	// clearing `title`, and the browser shows its native tooltip instead of the
	// styled popover. Removing every same-display island that is NOT a
	// descendant of the swapped root guarantees exactly one (fresh) island per
	// display after a swap. rebuildRegistry then reads the right payload.
	const swapId = root.getAttribute( 'data-sdaweb-gcal-id' );
	if ( swapId ) {
		const islands = document.querySelectorAll(
			'[data-sdaweb-gcal-event-hover-data][data-display-id="' + cssEscape( swapId ) + '"]'
		);
		let removed = 0;
		for ( const island of islands ) {
			if ( ! root.contains( island ) && island.parentNode ) {
				island.parentNode.removeChild( island );
				removed++;
			}
		}
		dlog( 'applySwap purged stale hover islands · id=', swapId, '· removed=', removed,
			'· remaining=', document.querySelectorAll(
				'[data-sdaweb-gcal-event-hover-data][data-display-id="' + cssEscape( swapId ) + '"]'
			).length );
	}

	if ( data.view ) {
		root.dataset.sdawebGcalView = data.view;
		// Prefer the freshly-rendered wrapper's FULL class list. The REST
		// endpoint strips the outer `.sdaweb-gcal` wrapper before sending the
		// inner HTML, so the only place the swapped-in view's layout classes
		// survive is `data.root_class`. Those layout classes are not cosmetic
		// extras — List's `heading-position-*` and `chip-style-*`, Month's
		// `has-week-numbers`/`chip-style-pastel`, etc. are required by compound
		// CSS selectors (e.g. `.sdaweb-gcal--list.heading-position-pill-left
		// .sdaweb-gcal-list__group-heading`). The legacy rewrite below only
		// swaps the `sdaweb-gcal--<view>` modifier, so after a Month→List swap
		// the root kept Month's classes and List rendered unstyled (week-heading
		// pills + event accent bars missing) until a hard refresh. Setting the
		// whole className from the server makes a swap byte-identical to a
		// full-page render. Falls back to the modifier-only rewrite when an
		// older cached payload predates the root_class field.
		if ( typeof data.root_class === 'string' && data.root_class !== '' ) {
			root.className = data.root_class;
		} else {
			root.className = root.className
				.replace( VIEW_CLASS_PATTERN, '' )
				.concat( ' sdaweb-gcal--' + data.view )
				.replace( /\s+/g, ' ' )
				.trim();
		}
	}
}

/**
 * Browser back/forward replay. The `state.sdaweb` payload carries the
 * params we pushed; if it's missing (visitor navigated cross-origin
 * and came back), bail to let the browser reload the page.
 *
 * @param {PopStateEvent} event Popstate event.
 */
function handlePopstate( event ) {
	const params = event.state && event.state.sdaweb;
	if ( ! params ) {
		return;
	}
	const root = document.querySelector(
		'.sdaweb-gcal[data-sdaweb-gcal-id="' + cssEscape( params.instance || params.slug ) + '"]'
	);
	if ( root && roots.has( root ) ) {
		swap( root, params, { pushHistory: false } );
	}
}

/**
 * Toggle aria-busy on the root. CSS-only shimmer kicks in via the
 * 250ms-delayed animation declared in front.css — fast swaps from a
 * prefetched response complete before the shimmer becomes visible.
 *
 * @param {HTMLElement} root Calendar root.
 * @param {boolean}     busy Whether the root is currently loading.
 */
function setLoadingState( root, busy ) {
	if ( busy ) {
		root.setAttribute( 'aria-busy', 'true' );
	} else {
		root.removeAttribute( 'aria-busy' );
	}
}

/**
 * Push a screen-reader announcement into the per-root aria-live region.
 * The region is rendered by the server (an empty .sdaweb-gcal-live
 * div with role="status" + aria-live="polite"); we update its text
 * content after each swap. Localised string comes from cfg.i18n.
 *
 * @param {HTMLElement} root Calendar root.
 * @param {object}      data REST response.
 */
function announceToScreenReader( root, data ) {
	if ( ! data || typeof data.view !== 'string' ) {
		// Same defensive bail as applySwap — keeps a malformed payload
		// from crashing the post-swap accessibility path.
		return;
	}
	let region = root.querySelector( '.sdaweb-gcal-live' );
	if ( ! region ) {
		// Renderer may not yet emit the region; create one defensively so
		// the swap still announces. Idempotent because the next swap
		// will reuse it.
		region = document.createElement( 'div' );
		region.className = 'sdaweb-gcal-live';
		region.setAttribute( 'role', 'status' );
		region.setAttribute( 'aria-live', 'polite' );
		region.style.position = 'absolute';
		region.style.width = '1px';
		region.style.height = '1px';
		region.style.overflow = 'hidden';
		region.style.clip = 'rect(0 0 0 0)';
		region.style.whiteSpace = 'nowrap';
		root.appendChild( region );
	}
	const template = ( cfg.i18n && cfg.i18n.viewChanged ) || 'View changed to %s.';
	region.textContent = template.replace( '%s', data.view || '' );
}

/**
 * Move focus to the new view's primary heading so keyboard users
 * continue from the relevant landmark instead of restarting from the
 * top of the document. tabindex="-1" is set programmatically because
 * the renderer's heading isn't normally focusable.
 *
 * @param {HTMLElement} root Calendar root.
 */
function moveFocusToHeading( root ) {
	const target = root.querySelector(
		'.sdaweb-gcal-chrome__title-text, .sdaweb-gcal-upcoming__title-text, h2, h3'
	);
	if ( ! target ) {
		return;
	}
	target.setAttribute( 'tabindex', '-1' );
	// Flag this programmatic focus so CSS can suppress the focus ring for it.
	// The heading is a tabindex="-1" landmark reachable ONLY via this move
	// (never by Tab), so it never needs a visible ring. iOS Safari matches
	// :focus-visible on script-driven focus of such an element, so the
	// CSS-only `:focus:not(:focus-visible)` suppression can't catch it and a
	// stray red box drew around the heading (e.g. "Uke 24" in Card view) after
	// a pointer-initiated swap on touch. The marker lets a higher-specificity
	// rule kill the ring regardless of the :focus-visible match; it's removed
	// on blur so a later genuine interaction elsewhere is unaffected.
	target.setAttribute( 'data-sdaweb-gcal-swap-focus', '' );
	target.addEventListener( 'blur', function () {
		target.removeAttribute( 'data-sdaweb-gcal-swap-focus' );
	}, { once: true } );
	target.focus( { preventScroll: true } );
}

/**
 * Minimal CSS.escape polyfill — modern browsers all have CSS.escape
 * but feature-checked path keeps the module bundler-free.
 *
 * @param {string} value Raw selector segment.
 * @returns {string}
 */
function cssEscape( value ) {
	if ( window.CSS && window.CSS.escape ) {
		return window.CSS.escape( value );
	}
	return String( value ).replace( /[^a-zA-Z0-9_-]/g, ( c ) => '\\' + c );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', boot );
} else {
	boot();
}

window.addEventListener( 'popstate', handlePopstate );
