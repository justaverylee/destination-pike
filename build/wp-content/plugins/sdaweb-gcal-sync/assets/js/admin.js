( function () {
	'use strict';

	/**
	 * SDAweb Calendar Sync — admin behaviors.
	 * Vanilla JS; no React, no jQuery.
	 */

	const config = window.sdawebGcalAdmin || {};
	const i18n = config.i18n || {};
	const restRoot = ( config.restRoot || '' ).replace( /\/$/, '' );
	const nonce = config.nonce || '';

	function init() {
		initDirtyFlag();
		initCalendarForm();
		initRefreshButtons();
		initCopyButtons();
		initFieldHelp();
		initSectionToggle();
		initGroupDependents();
		initFieldGates();
		initColorPickers();
		initThemePresets();
		initAdminPreviewSwitcher();
		initPreviewCount();
		initScopeFilterBar();
	}

	/**
	 * Theme presets — coordinated value bundles that fill the color +
	 * today-style + chip-style fields with one click. Authors who don't
	 * know which hex picks well together get a kickstart; they can still
	 * tune individual fields after applying.
	 */
	const THEME_PRESETS = {
		'default': {
			primary_color: '#1d5a8e',
			accent_color:  '#3a87ad',
			today_color:   '#1d5a8e',
			link_color:    '',
			today_style:   'cell',
			list_chip_style:  'linear',
			month_chip_style: 'solid',
		},
		'warm-earth': {
			primary_color: '#a02f2a',
			accent_color:  '#c97e30',
			today_color:   '#a02f2a',
			link_color:    '#7a1f1c',
			today_style:   'column',
			list_chip_style:  'linear',
			month_chip_style: 'pastel',
		},
		'high-contrast': {
			primary_color: '#000000',
			accent_color:  '#1d2327',
			today_color:   '#000000',
			link_color:    '#0040c0',
			today_style:   'cell',
			list_chip_style:  'linear',
			month_chip_style: 'solid',
		},
		'forest': {
			primary_color: '#2d5a3d',
			accent_color:  '#5a8c6a',
			today_color:   '#2d5a3d',
			link_color:    '',
			today_style:   'cell',
			list_chip_style:  'linear',
			month_chip_style: 'pastel',
		},
		'sunset': {
			primary_color: '#a84020',
			accent_color:  '#e8a04a',
			today_color:   '#a84020',
			link_color:    '',
			today_style:   'column',
			list_chip_style:  'linear',
			month_chip_style: 'pastel',
		},
	};

	function initThemePresets() {
		const select = document.querySelector( '[data-sdaweb-gcal-theme-preset]' );
		const apply = document.querySelector( '[data-sdaweb-gcal-preset-apply]' );
		if ( ! select || ! apply ) {
			return;
		}
		apply.addEventListener( 'click', function ( event ) {
			event.preventDefault();
			const key = select.value;
			if ( ! key || ! THEME_PRESETS[ key ] ) {
				return;
			}
			applyPreset( THEME_PRESETS[ key ] );
		} );
	}

	function applyPreset( preset ) {
		const $ = window.jQuery;
		// Color fields — go through wpColorPicker so the swatch updates too.
		Object.keys( preset ).forEach( function ( fieldName ) {
			const value = preset[ fieldName ];
			const el = document.querySelector( '[name="' + fieldName + '"]' );
			if ( ! el ) {
				return;
			}
			if ( el.tagName === 'SELECT' ) {
				el.value = value;
				el.dispatchEvent( new Event( 'change', { bubbles: true } ) );
				return;
			}
			if ( el.classList.contains( 'sdaweb-gcal-color-picker' ) && $ && $.fn && $.fn.wpColorPicker ) {
				if ( value === '' ) {
					$( el ).wpColorPicker( 'color', '' );
				} else {
					$( el ).wpColorPicker( 'color', value );
				}
				el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
				return;
			}
			el.value = value;
			el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		} );
	}

	/**
	 * Upgrade `.sdaweb-gcal-color-picker` text inputs to WP's color picker, and
	 * attach a live WCAG contrast badge that grades the chosen hex against both
	 * the light surface (#ffffff) and the dark surface (#1d2327) so authors can
	 * see at a glance whether the color works in both modes.
	 *
	 * Bridged through jQuery because wpColorPicker is a jQuery plugin.
	 */
	function initColorPickers() {
		const $ = window.jQuery;
		if ( ! $ || ! $.fn || ! $.fn.wpColorPicker ) {
			return;
		}
		$( '.sdaweb-gcal-color-picker' ).each( function () {
			const input = this;
			const defaultColor = input.getAttribute( 'data-default-color' ) || '';

			const badge = document.createElement( 'div' );
			badge.className = 'sdaweb-gcal-contrast-badge';
			badge.setAttribute( 'aria-live', 'polite' );
			input.parentNode.appendChild( badge );

			// Per-calendar Text color (0.9.0): contrast is checked against
			// the calendar's own feed color (the `Color` field in the same
			// form), not the standard light/dark surfaces. The feed color is
			// the Solid chip worst case — Pastel renders the same text on a
			// softer tint, so it always has more headroom.
			const againstFeed = input.hasAttribute( 'data-sdaweb-gcal-against-feed' );
			let feedInput = null;
			if ( againstFeed ) {
				const form = input.closest( 'form' ) || document;
				feedInput = form.querySelector( '[data-sdaweb-gcal-calendar-color]' );
			}
			const refreshBadge = () => {
				if ( againstFeed ) {
					updateContrastBadgeAgainstFeed( badge, input.value, feedInput ? feedInput.value : '' );
				} else {
					updateContrastBadge( badge, input.value );
				}
			};
			if ( feedInput ) {
				feedInput.addEventListener( 'input', refreshBadge );
				feedInput.addEventListener( 'change', refreshBadge );
			}

			const reset = document.createElement( 'button' );
			reset.type = 'button';
			reset.className = 'sdaweb-gcal-color-reset button-link';
			reset.textContent = i18n.resetToDefault || 'Reset to default';
			if ( ! defaultColor ) {
				reset.disabled = true;
			} else {
				reset.title = defaultColor;
			}
			reset.addEventListener( 'click', function () {
				if ( ! defaultColor ) {
					return;
				}
				$( input ).wpColorPicker( 'color', defaultColor );
				input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
				refreshBadge();
			} );
			input.parentNode.appendChild( reset );

			$( input ).wpColorPicker( {
				defaultColor: defaultColor,
				change: function ( event, ui ) {
					event.target.value = ui.color.toString();
					event.target.dispatchEvent( new Event( 'input', { bubbles: true } ) );
					if ( againstFeed ) {
						updateContrastBadgeAgainstFeed( badge, ui.color.toString(), feedInput ? feedInput.value : '' );
					} else {
						updateContrastBadge( badge, ui.color.toString() );
					}
				},
				clear: function () {
					if ( againstFeed ) {
						updateContrastBadgeAgainstFeed( badge, '', feedInput ? feedInput.value : '' );
					} else {
						updateContrastBadge( badge, '' );
					}
					input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
				},
			} );
			refreshBadge();
		} );
	}

	function updateContrastBadge( badge, hex ) {
		if ( ! hex ) {
			badge.textContent = '';
			badge.removeAttribute( 'data-state' );
			return;
		}
		const lightRatio = contrastRatio( hex, '#ffffff' );
		const darkRatio  = contrastRatio( hex, '#1d2327' );
		if ( lightRatio === null || darkRatio === null ) {
			badge.textContent = '';
			badge.removeAttribute( 'data-state' );
			return;
		}
		const lightOk = lightRatio >= 3;
		const darkOk  = darkRatio >= 3;
		const fmt = ( ratio, ok ) => `${ ratio.toFixed( 1 ) }:1 ${ ok ? '✓' : '✗' }`;
		badge.innerHTML =
			`<span class="sdaweb-gcal-contrast-badge__pill" data-pass="${ lightOk }">Light ${ fmt( lightRatio, lightOk ) }</span>` +
			`<span class="sdaweb-gcal-contrast-badge__pill" data-pass="${ darkOk }">Dark ${ fmt( darkRatio, darkOk ) }</span>`;
		badge.setAttribute( 'data-state', lightOk && darkOk ? 'pass' : ( lightOk || darkOk ? 'partial' : 'fail' ) );
	}

	/**
	 * Contrast badge for the per-calendar Text color picker.
	 *
	 * Reports a single ratio against the calendar's own feed color (Solid
	 * chip background — the worst case). Empty text color = "Auto" hand-off,
	 * shown as a neutral pill so admins know the field is intentionally
	 * unset rather than misconfigured. WCAG AA threshold is 4.5:1 for body
	 * text; the badge uses ✓/✗ at that line.
	 */
	function updateContrastBadgeAgainstFeed( badge, textHex, feedHex ) {
		if ( ! textHex ) {
			badge.innerHTML = `<span class="sdaweb-gcal-contrast-badge__pill" data-pass="neutral">${ i18n.usingDisplaySetting || 'Using display setting' }</span>`;
			badge.setAttribute( 'data-state', 'neutral' );
			return;
		}
		if ( ! feedHex ) {
			badge.textContent = '';
			badge.removeAttribute( 'data-state' );
			return;
		}
		const ratio = contrastRatio( textHex, feedHex );
		if ( ratio === null ) {
			badge.textContent = '';
			badge.removeAttribute( 'data-state' );
			return;
		}
		const ok = ratio >= 4.5;
		const label = i18n.againstFeedLabel || 'Against feed color';
		badge.innerHTML = `<span class="sdaweb-gcal-contrast-badge__pill" data-pass="${ ok }">${ label } ${ ratio.toFixed( 1 ) }:1 ${ ok ? '✓' : '✗' }</span>`;
		badge.setAttribute( 'data-state', ok ? 'pass' : 'fail' );
	}

	function contrastRatio( hexA, hexB ) {
		const lA = relativeLuminance( hexA );
		const lB = relativeLuminance( hexB );
		if ( lA === null || lB === null ) {
			return null;
		}
		const lighter = Math.max( lA, lB );
		const darker  = Math.min( lA, lB );
		return ( lighter + 0.05 ) / ( darker + 0.05 );
	}

	function relativeLuminance( hex ) {
		const rgb = parseHex( hex );
		if ( ! rgb ) {
			return null;
		}
		const channel = ( c ) => {
			const v = c / 255;
			return v <= 0.03928 ? v / 12.92 : Math.pow( ( v + 0.055 ) / 1.055, 2.4 );
		};
		return 0.2126 * channel( rgb[0] ) + 0.7152 * channel( rgb[1] ) + 0.0722 * channel( rgb[2] );
	}

	function parseHex( hex ) {
		let h = String( hex || '' ).trim().replace( /^#/, '' );
		if ( h.length === 3 ) {
			h = h.split( '' ).map( ( c ) => c + c ).join( '' );
		}
		if ( ! /^[0-9a-fA-F]{6}$/.test( h ) ) {
			return null;
		}
		return [ parseInt( h.slice( 0, 2 ), 16 ), parseInt( h.slice( 2, 4 ), 16 ), parseInt( h.slice( 4, 6 ), 16 ) ];
	}

	/**
	 * Selects with `data-sdaweb-gcal-section-toggle="<containerId>"` show
	 * `[data-sdaweb-gcal-section="<value>"]` form sections within that container,
	 * hiding the rest. Multiple values can be space-separated, in which case
	 * the section is shown when the trigger value matches any of them.
	 *
	 * If the container ID does not resolve to an element, the trigger falls back
	 * to scanning the whole document — preserving compatibility with markup that
	 * predates the container wrapper.
	 */
	function initSectionToggle() {
		const triggers = document.querySelectorAll( '[data-sdaweb-gcal-section-toggle]' );
		triggers.forEach( function ( select ) {
			const containerId = select.getAttribute( 'data-sdaweb-gcal-section-toggle' );
			const root = containerId ? document.getElementById( containerId ) : null;
			const sections = ( root || document ).querySelectorAll( '[data-sdaweb-gcal-section]' );
			function update() {
				sections.forEach( function ( section ) {
					const accepted = ( section.getAttribute( 'data-sdaweb-gcal-section' ) || '' ).split( /\s+/ );
					section.hidden = accepted.indexOf( select.value ) === -1;
				} );
			}
			select.addEventListener( 'change', update );
			update();
		} );
	}

	/**
	 * View filter bar (Tier 2.5). A single server-rendered toolbar at the top
	 * of the Displays form focuses the long form on one view's settings.
	 * Clicking a view button truly hides (not dims) every fieldset whose
	 * data-sdaweb-gcal-scope doesn't include that view — except sections
	 * tagged "all" or "structure", which are always relevant. "All" clears
	 * the focus and shows everything.
	 *
	 * Admin-only and visual only: hidden sections use the `hidden` attribute,
	 * never `disabled`, so every field still submits on save. The chosen
	 * filter is remembered per display slug in localStorage. A live status
	 * line announces how many sections are visible. If the page rendered with
	 * a validation error, the filter is forced to "All" so the error can't be
	 * hidden behind a focus.
	 */
	function initScopeFilterBar() {
		const VIEWS = [ 'upcoming', 'list', 'card', 'month', 'mini' ]; // "day"/"week" omitted on purpose.
		const toolbar = document.querySelector( '.sdaweb-gcal-scope-filter' );
		if ( ! toolbar ) {
			return;
		}

		const fieldsets = Array.prototype.slice.call(
			document.querySelectorAll( '.sdaweb-gcal-fieldset[data-sdaweb-gcal-scope]' )
		);
		const status = toolbar.querySelector( '.sdaweb-gcal-scope-filter__status' );

		const slug = new URLSearchParams( window.location.search ).get( 'slug' ) || 'default';
		const storeKey = 'sdawebGcalScopeFilter:' + slug;

		function tokensOf( fs ) {
			return ( fs.getAttribute( 'data-sdaweb-gcal-scope' ) || '' ).trim().split( /\s+/ );
		}

		function isVisible( fs, view ) {
			if ( ! view ) {
				return true; // "All".
			}
			const t = tokensOf( fs );
			return t.indexOf( 'structure' ) !== -1
				|| t.indexOf( 'all' ) !== -1
				|| t.indexOf( view ) !== -1;
		}

		function apply( view ) {
			let shown = 0;
			fieldsets.forEach( function ( fs ) {
				const show = isVisible( fs, view );
				fs.hidden = ! show; // Visual only: never `disabled` — fields must still submit.
				if ( show ) {
					shown++;
				}
			} );

			toolbar.querySelectorAll( '[data-scope-filter]' ).forEach( function ( btn ) {
				const active = btn.getAttribute( 'data-scope-filter' ) === ( view || 'all' );
				btn.classList.toggle( 'is-active', active );
				btn.setAttribute( 'aria-pressed', active ? 'true' : 'false' );
			} );

			if ( status ) {
				if ( view ) {
					const tpl = i18n.scopeStatusTpl || 'Showing %1$d of %2$d sections.';
					status.textContent = tpl
						.replace( '%1$d', shown )
						.replace( '%2$d', fieldsets.length );
					status.hidden = false;
				} else {
					status.textContent = '';
					status.hidden = true;
				}
			}

			try {
				if ( view ) {
					window.localStorage.setItem( storeKey, view );
				} else {
					window.localStorage.removeItem( storeKey );
				}
			} catch ( e ) {} // localStorage may be unavailable (private mode / quota).
		}

		// Count badges + tooltips. The badge counts sections *specific* to each
		// view (pseudo tokens all/structure are excluded — they show under every
		// filter), so the badge number is smaller than the total shown when the
		// filter is applied. A title makes that explicit on hover.
		VIEWS.forEach( function ( view ) {
			const n = fieldsets.filter( function ( fs ) {
				return tokensOf( fs ).indexOf( view ) !== -1;
			} ).length;
			const btn = toolbar.querySelector( '[data-scope-filter="' + view + '"]' );
			if ( ! btn ) {
				return;
			}
			const badge = btn.querySelector( '.sdaweb-gcal-scope-filter__count' );
			if ( badge && n > 0 ) {
				badge.textContent = n;
			}
			const labelEl = btn.querySelector( '.sdaweb-gcal-scope-filter__chip-text' );
			const label = labelEl ? labelEl.textContent.trim() : view;
			const isOne = n === 1;

			// Sighted: hover tooltip explaining the badge number.
			const titleTpl = isOne
				? ( i18n.scopeCountTitleOne || '%1$d section specific to the %2$s view' )
				: ( i18n.scopeCountTitleMany || '%1$d sections specific to the %2$s view' );
			btn.title = titleTpl.replace( '%1$d', n ).replace( '%2$s', label );

			// Screen reader: fold the count into the accessible name so the
			// aria-hidden badge number isn't lost to assistive tech. Overrides the
			// server-rendered aria-label ("Show only List settings"); if JS never
			// runs, that simpler label remains as a fallback.
			const ariaTpl = isOne
				? ( i18n.scopeShowOnlyOne || 'Show only %1$s settings (%2$d section)' )
				: ( i18n.scopeShowOnlyMany || 'Show only %1$s settings (%2$d sections)' );
			btn.setAttribute( 'aria-label', ariaTpl.replace( '%1$s', label ).replace( '%2$d', n ) );
		} );

		// "All" badge shows the total section count — it always reveals every section.
		const allBtn = toolbar.querySelector( '[data-scope-filter="all"]' );
		if ( allBtn ) {
			const allBadge = allBtn.querySelector( '.sdaweb-gcal-scope-filter__count' );
			if ( allBadge && fieldsets.length > 0 ) {
				allBadge.textContent = fieldsets.length;
			}
			allBtn.title = ( i18n.scopeAllTitleTpl || 'Shows all %d settings sections' ).replace( '%d', fieldsets.length );
		}

		toolbar.addEventListener( 'click', function ( e ) {
			const btn = e.target.closest( '[data-scope-filter]' );
			if ( ! btn ) {
				return;
			}
			const v = btn.getAttribute( 'data-scope-filter' );
			apply( v === 'all' ? null : v );
		} );

		// Roving tabindex — turn the button row into a proper ARIA toolbar: a
		// single tab stop, with Left/Right/Up/Down/Home/End moving focus between
		// buttons. The last-focused button stays the tab stop.
		const buttons = Array.prototype.slice.call( toolbar.querySelectorAll( '[data-scope-filter]' ) );
		buttons.forEach( function ( btn ) {
			btn.tabIndex = btn.getAttribute( 'aria-pressed' ) === 'true' ? 0 : -1;
			btn.addEventListener( 'focus', function () {
				buttons.forEach( function ( b ) {
					b.tabIndex = b === btn ? 0 : -1;
				} );
			} );
		} );
		if ( buttons.length && ! buttons.some( function ( b ) { return b.tabIndex === 0; } ) ) {
			buttons[ 0 ].tabIndex = 0;
		}
		function focusButtonAt( idx ) {
			const len = buttons.length;
			buttons[ ( idx + len ) % len ].focus();
		}
		toolbar.addEventListener( 'keydown', function ( e ) {
			const idx = buttons.indexOf( document.activeElement );
			if ( idx === -1 ) {
				return;
			}
			switch ( e.key ) {
				case 'ArrowRight':
				case 'ArrowDown':
					e.preventDefault();
					focusButtonAt( idx + 1 );
					break;
				case 'ArrowLeft':
				case 'ArrowUp':
					e.preventDefault();
					focusButtonAt( idx - 1 );
					break;
				case 'Home':
					e.preventDefault();
					focusButtonAt( 0 );
					break;
				case 'End':
					e.preventDefault();
					focusButtonAt( buttons.length - 1 );
					break;
			}
		} );

		// Save-error safeguard: if the page rendered with a validation error,
		// force "All" so the failing section is never hidden behind a filter.
		const hasError = document.querySelector( '.notice-error, .sdaweb-gcal-field--error, [aria-invalid="true"]' );
		let stored = null;
		try {
			stored = window.localStorage.getItem( storeKey );
		} catch ( e ) {}

		// Hand off from the pre-paint CSS guard to the live controller. Removing
		// the attribute and re-applying via `hidden` happens in one synchronous
		// task, so the same sections stay hidden with no intermediate paint.
		document.documentElement.removeAttribute( 'data-sdaweb-gcal-scope-initial' );

		if ( hasError ) {
			apply( null );
		} else if ( stored && VIEWS.indexOf( stored ) > -1 ) {
			apply( stored );
		} else {
			apply( null );
		}
	}

	/**
	 * Admin preview switcher — when an edit-display screen has rendered
	 * multiple view panes (primary view + view-toggle views), wire the
	 * switcher buttons above the preview pane to swap which pane is visible.
	 * Pure visibility toggle — all panes are server-rendered on page load
	 * from the saved configuration, so switching is instant with no extra
	 * HTTP traffic.
	 */
	function initAdminPreviewSwitcher() {
		const switchers = document.querySelectorAll( '[data-sdaweb-gcal-admin-preview-switch]' );
		if ( ! switchers.length ) {
			return;
		}
		switchers.forEach( function ( btn ) {
			btn.addEventListener( 'click', function ( e ) {
				e.preventDefault();
				const target = btn.getAttribute( 'data-sdaweb-gcal-admin-preview-switch' );
				const root = btn.closest( '.sdaweb-gcal-display-preview' );
				if ( ! root || ! target ) {
					return;
				}
				root.querySelectorAll( '[data-sdaweb-gcal-admin-preview-switch]' ).forEach( function ( b ) {
					const isActive = b.getAttribute( 'data-sdaweb-gcal-admin-preview-switch' ) === target;
					b.classList.toggle( 'is-active', isActive );
					b.setAttribute( 'aria-pressed', isActive ? 'true' : 'false' );
				} );
				root.querySelectorAll( '[data-sdaweb-gcal-admin-preview-view]' ).forEach( function ( pane ) {
					const matches = pane.getAttribute( 'data-sdaweb-gcal-admin-preview-view' ) === target;
					pane.hidden = ! matches;
					pane.classList.toggle( 'is-active', matches );
				} );
				updatePreviewCount();
			} );
		} );
	}

	/**
	 * Live event count for the admin preview. Counts the distinct events the
	 * preview actually rendered (by data-sdaweb-gcal-event-id, so a multi-day
	 * event counts once) in the currently visible pane and shows "Showing N
	 * events". Because the preview reuses the real Display_Renderer, this is
	 * exactly what the front-end would show — making "why do I only see 2?"
	 * answerable at a glance instead of by inspecting the live site.
	 */
	function countPreviewEvents( pane ) {
		if ( ! pane ) {
			return 0;
		}
		const ids = {};
		pane.querySelectorAll( '[data-sdaweb-gcal-event-id]' ).forEach( function ( el ) {
			ids[ el.getAttribute( 'data-sdaweb-gcal-event-id' ) ] = true;
		} );
		return Object.keys( ids ).length;
	}

	function updatePreviewCount() {
		const root = document.querySelector( '.sdaweb-gcal-display-preview' );
		if ( ! root ) {
			return;
		}
		const out = root.querySelector( '[data-sdaweb-gcal-preview-count]' );
		if ( ! out ) {
			return;
		}
		const pane = root.querySelector( '.sdaweb-gcal-display-preview__pane.is-active' )
			|| root.querySelector( '.sdaweb-gcal-display-preview__pane:not([hidden])' );
		const n = countPreviewEvents( pane );
		const tpl = i18n.previewCountTpl || 'Showing %d events';
		out.textContent = tpl.replace( '%d', n );
	}

	function initPreviewCount() {
		updatePreviewCount();
	}

	/**
	 * Greys out List-view dependent fields when the current "Group events"
	 * value doesn't activate them, and tags the "Show date on each event row"
	 * checkbox as suppressed when grouping is "By day". Both are visual hints
	 * only — values still submit, so admins don't lose their selections when
	 * switching grouping modes.
	 */
	function initGroupDependents() {
		const select = document.getElementById( 'sdaweb_gcal_group' );
		if ( ! select ) {
			return;
		}
		const dependents = document.querySelectorAll( '[data-sdaweb-gcal-group-active]' );
		const suppressed = document.querySelectorAll( '[data-sdaweb-gcal-suppressed-when-group]' );
		const usedInLists = document.querySelectorAll( '.sdaweb-gcal-used-in' );
		function update() {
			const current = select.value;
			dependents.forEach( function ( el ) {
				const accepted = ( el.getAttribute( 'data-sdaweb-gcal-group-active' ) || '' ).split( /\s+/ );
				const isActive = accepted.indexOf( current ) !== -1;
				el.classList.toggle( 'is-inactive', ! isActive );
				// Surface the gating condition as a visible badge — replaces the
				// "you have to read help text to find out why this is greyed"
				// pattern with an in-place explanation.
				const activeBadge = el.querySelector( '[data-sdaweb-gcal-status-active]' );
				const inactiveBadge = el.querySelector( '[data-sdaweb-gcal-status-inactive]' );
				if ( activeBadge ) {
					activeBadge.hidden = ! isActive;
				}
				if ( inactiveBadge ) {
					inactiveBadge.hidden = isActive;
				}
			} );
			suppressed.forEach( function ( el ) {
				const trigger = el.getAttribute( 'data-sdaweb-gcal-suppressed-when-group' );
				const isSuppressed = current === trigger;
				el.classList.toggle( 'is-suppressed', isSuppressed );
				const tag = el.querySelector( '.sdaweb-gcal-suppress-tag' );
				if ( tag ) {
					tag.hidden = ! isSuppressed;
				}
			} );
			// "Used in:" lists — mark which contexts are currently active by
			// adding `is-active` to matching <li>s. CSS shows a ✓ on actives
			// and a — on the rest. Pure visual cue, no aria.
			usedInLists.forEach( function ( list ) {
				list.querySelectorAll( '[data-sdaweb-gcal-used-in-context]' ).forEach( function ( item ) {
					const matches = item.getAttribute( 'data-sdaweb-gcal-used-in-context' ) === current;
					item.classList.toggle( 'is-active', matches );
				} );
			} );
		}
		select.addEventListener( 'change', update );
		update();
	}

	/**
	 * Generic field-dependency driver (v0.11.0).
	 *
	 * Mirrors initGroupDependents() but supports gates on any master input
	 * (checkbox, text, url, select), not just the Group events select. Pair
	 * with .sdaweb-gcal-field--dependent + status badge spans for the
	 * existing inactive-dim visual treatment.
	 *
	 * Markup contract on the gated field:
	 *   <div class="sdaweb-gcal-field sdaweb-gcal-field--dependent"
	 *        data-sdaweb-gcal-active-when="<master_name>:<condition>[ <master_name>:<condition>]">
	 *     <label>↳ Label
	 *       <span ... data-sdaweb-gcal-status-active>active</span>
	 *       <span ... data-sdaweb-gcal-status-inactive hidden>inactive — needs …</span>
	 *     </label>
	 *     <input … />
	 *   </div>
	 *
	 * Condition grammar (per master):
	 *   "1"             — checkbox checked, or input value equals "1"
	 *   "0"             — checkbox unchecked
	 *   "value1|value2" — input value is one of these
	 *   "nonempty"      — input value, trimmed, is not the empty string
	 *   "empty"         — input value, trimmed, IS the empty string
	 *
	 * Multiple conditions combine with AND. Field is "active" only when
	 * every condition holds; otherwise the `.is-inactive` class is added
	 * and the badge swaps to the inactive span.
	 *
	 * Field stays interactive (no `disabled`) so editors can still see and
	 * edit dimmed values — the value persists in the DB even when the
	 * master is off, per the brief's acceptance criterion.
	 */
	function initFieldGates() {
		const gated = document.querySelectorAll( '[data-sdaweb-gcal-active-when]' );
		if ( ! gated.length ) {
			return;
		}

		function evalCondition( masterName, condition ) {
			const inputs = document.querySelectorAll( '[name="' + masterName + '"]' );
			if ( ! inputs.length ) {
				return false;
			}
			// Read the active value. For checkbox: 1 if checked else 0. For
			// radio: the value of the checked one. For text/url/select: the
			// element's .value, trimmed.
			let value = '';
			const first = inputs[ 0 ];
			if ( first.type === 'checkbox' ) {
				value = first.checked ? '1' : '0';
			} else if ( first.type === 'radio' ) {
				for ( let i = 0; i < inputs.length; i++ ) {
					if ( inputs[ i ].checked ) {
						value = ( inputs[ i ].value || '' ).trim();
						break;
					}
				}
			} else {
				value = ( first.value || '' ).trim();
			}

			if ( condition === 'nonempty' ) {
				return value !== '';
			}
			if ( condition === 'empty' ) {
				return value === '';
			}
			const allowed = condition.split( '|' );
			return allowed.indexOf( value ) !== -1;
		}

		function isActive( el ) {
			const conds = ( el.getAttribute( 'data-sdaweb-gcal-active-when' ) || '' ).split( /\s+/ ).filter( Boolean );
			for ( let i = 0; i < conds.length; i++ ) {
				const idx = conds[ i ].indexOf( ':' );
				if ( idx < 0 ) {
					continue;
				}
				const masterName = conds[ i ].substring( 0, idx );
				const condition = conds[ i ].substring( idx + 1 );
				if ( ! evalCondition( masterName, condition ) ) {
					return false;
				}
			}
			return true;
		}

		function refresh() {
			gated.forEach( function ( el ) {
				const active = isActive( el );
				el.classList.toggle( 'is-inactive', ! active );
				const activeBadge = el.querySelector( '[data-sdaweb-gcal-status-active]' );
				const inactiveBadge = el.querySelector( '[data-sdaweb-gcal-status-inactive]' );
				if ( activeBadge ) {
					activeBadge.hidden = ! active;
				}
				if ( inactiveBadge ) {
					inactiveBadge.hidden = active;
				}
			} );
		}

		// Wire change/input listeners on every master input referenced by
		// any gated field. Using a Set so we don't register the same listener
		// twice when multiple gated fields share a master.
		const masters = new Set();
		gated.forEach( function ( el ) {
			const conds = ( el.getAttribute( 'data-sdaweb-gcal-active-when' ) || '' ).split( /\s+/ ).filter( Boolean );
			conds.forEach( function ( cond ) {
				const idx = cond.indexOf( ':' );
				if ( idx > 0 ) {
					masters.add( cond.substring( 0, idx ) );
				}
			} );
		} );

		masters.forEach( function ( masterName ) {
			const inputs = document.querySelectorAll( '[name="' + masterName + '"]' );
			inputs.forEach( function ( input ) {
				input.addEventListener( 'change', refresh );
				input.addEventListener( 'input', refresh );
			} );
		} );

		refresh();
	}

	/**
	 * Selects with `data-sdaweb-gcal-help-toggle="<targetId>"` reveal one
	 * `[data-for="<value>"]` block inside the matching help container, hiding
	 * the others. Lets us inline a contextual explanation that changes as the
	 * user picks different options.
	 */
	function initFieldHelp() {
		const triggers = document.querySelectorAll( '[data-sdaweb-gcal-help-toggle]' );
		triggers.forEach( function ( select ) {
			const targetId = select.getAttribute( 'data-sdaweb-gcal-help-toggle' );
			if ( ! targetId ) {
				return;
			}
			const target = document.getElementById( targetId );
			if ( ! target ) {
				return;
			}
			function update() {
				const items = target.querySelectorAll( '[data-for]' );
				items.forEach( function ( item ) {
					item.hidden = item.getAttribute( 'data-for' ) !== select.value;
				} );
			}
			select.addEventListener( 'change', update );
			update();
		} );
	}

	/**
	 * Click-to-copy on shortcode badges in the displays list.
	 */
	function initCopyButtons() {
		const buttons = document.querySelectorAll( '.sdaweb-gcal-copy-shortcode' );
		buttons.forEach( function ( btn ) {
			btn.addEventListener( 'click', function () {
				const text = btn.getAttribute( 'data-clipboard' ) || '';
				if ( ! text ) {
					return;
				}
				const original = btn.textContent;

				const finish = function () {
					btn.textContent = i18n.copied || 'Copied';
					setTimeout( function () {
						btn.textContent = original;
					}, 1500 );
				};

				if ( navigator.clipboard && navigator.clipboard.writeText ) {
					navigator.clipboard.writeText( text ).then( finish, function () {
						fallbackCopy( text, finish );
					} );
				} else {
					fallbackCopy( text, finish );
				}
			} );
		} );
	}

	function fallbackCopy( text, onDone ) {
		const ta = document.createElement( 'textarea' );
		ta.value = text;
		ta.setAttribute( 'readonly', '' );
		ta.style.position = 'absolute';
		ta.style.left = '-9999px';
		document.body.appendChild( ta );
		ta.select();
		try {
			document.execCommand( 'copy' );
		} catch ( e ) {
			// no-op.
		}
		document.body.removeChild( ta );
		if ( typeof onDone === 'function' ) {
			onDone();
		}
	}

	/**
	 * Dirty-flag tracking on the main settings form.
	 */
	function initDirtyFlag() {
		const forms = document.querySelectorAll(
			'[data-sdaweb-gcal-calendar-form], [data-sdaweb-gcal-display-form]'
		);
		if ( ! forms.length ) {
			return;
		}

		let isDirty = false;
		let isSubmitting = false;

		function markDirty() {
			isDirty = true;
		}

		forms.forEach( function ( form ) {
			form.addEventListener( 'input', markDirty, true );
			form.addEventListener( 'change', markDirty, true );
			form.addEventListener( 'submit', function () {
				isSubmitting = true;
				isDirty = false;
			} );
		} );

		window.addEventListener( 'beforeunload', function ( event ) {
			if ( ! isDirty || isSubmitting ) {
				return undefined;
			}
			const message = i18n.unsavedChanges || '';
			event.preventDefault();
			event.returnValue = message;
			return message;
		} );
	}

	/**
	 * Calendar add/edit form: source-type switcher, replace-credentials, test connection.
	 */
	function initCalendarForm() {
		const form = document.querySelector( '[data-sdaweb-gcal-calendar-form]' );
		if ( ! form ) {
			return;
		}

		const radios = form.querySelectorAll( 'input[name="source_type"]' );
		const labelApi = form.querySelector( '[data-sdaweb-gcal-label-for="api_key"]' );
		const labelSa = form.querySelector( '[data-sdaweb-gcal-label-for="service_account"]' );
		const inputText = form.querySelector( '[data-sdaweb-gcal-secret-text]' );
		const inputTextarea = form.querySelector( '[data-sdaweb-gcal-secret-textarea]' );
		const saWrap = form.querySelector( '[data-sdaweb-gcal-sa-wrap]' );
		const saFile = form.querySelector( '[data-sdaweb-gcal-sa-file]' );
		const saFilename = form.querySelector( '[data-sdaweb-gcal-sa-filename]' );
		const helpApi = form.querySelector( '[data-sdaweb-gcal-secret-help-api]' );
		const helpSa = form.querySelector( '[data-sdaweb-gcal-secret-help-sa]' );
		const replaceBtn = form.querySelector( '[data-sdaweb-gcal-replace-secret]' );
		const mask = form.querySelector( '[data-sdaweb-gcal-secret-mask]' );
		const inputWrap = form.querySelector( '[data-sdaweb-gcal-secret-input]' );
		const testBtn = form.querySelector( '[data-sdaweb-gcal-test-connection]' );
		const testResult = form.querySelector( '[data-sdaweb-gcal-test-result]' );

		function applySourceType( value ) {
			const isApi = value === 'api_key';
			toggle( labelApi, isApi );
			toggle( labelSa, ! isApi );
			toggle( helpApi, isApi );
			toggle( helpSa, ! isApi );
			if ( inputText ) {
				toggle( inputText, isApi );
				inputText.disabled = ! isApi;
			}
			if ( saWrap ) {
				toggle( saWrap, ! isApi );
			}
			if ( inputTextarea ) {
				inputTextarea.disabled = isApi;
			}
		}

		if ( saFile && inputTextarea ) {
			saFile.addEventListener( 'change', function () {
				const file = saFile.files && saFile.files[ 0 ];
				if ( ! file ) {
					return;
				}
				const reader = new FileReader();
				reader.onload = function ( e ) {
					const text = String( e.target.result || '' ).trim();
					inputTextarea.value = text;
					if ( saFilename ) {
						saFilename.textContent = file.name;
					}
					inputTextarea.dispatchEvent( new Event( 'input', { bubbles: true } ) );
				};
				reader.onerror = function () {
					if ( saFilename ) {
						saFilename.textContent = i18n.fileReadError || 'Could not read file.';
					}
				};
				reader.readAsText( file );
			} );
		}

		const saDetected = form.querySelector( '[data-sdaweb-gcal-sa-detected]' );
		const saEmailEl = form.querySelector( '[data-sdaweb-gcal-sa-email]' );
		const saCopyBtn = form.querySelector( '[data-sdaweb-gcal-sa-copy]' );

		function refreshDetectedEmail() {
			if ( ! inputTextarea || ! saDetected || ! saEmailEl || ! saCopyBtn ) {
				return;
			}
			const raw = ( inputTextarea.value || '' ).trim();
			if ( raw === '' ) {
				saDetected.hidden = true;
				return;
			}
			let parsed = null;
			try {
				parsed = JSON.parse( raw );
			} catch ( e ) {
				saDetected.hidden = true;
				return;
			}
			const email = parsed && typeof parsed.client_email === 'string' ? parsed.client_email : '';
			if ( ! email ) {
				saDetected.hidden = true;
				return;
			}
			saEmailEl.textContent = email;
			saCopyBtn.setAttribute( 'data-clipboard', email );
			saDetected.hidden = false;
		}

		if ( inputTextarea ) {
			inputTextarea.addEventListener( 'input', refreshDetectedEmail );
			refreshDetectedEmail();
		}

		radios.forEach( function ( r ) {
			r.addEventListener( 'change', function () {
				if ( r.checked ) {
					applySourceType( r.value );
				}
			} );
			if ( r.checked ) {
				applySourceType( r.value );
			}
		} );

		if ( replaceBtn && mask && inputWrap ) {
			replaceBtn.addEventListener( 'click', function () {
				mask.hidden = true;
				inputWrap.hidden = false;
				const active = form.querySelector( 'input[name="source_type"]:checked' );
				if ( active ) {
					applySourceType( active.value );
				}
				const focusable = inputText && ! inputText.disabled ? inputText : inputTextarea;
				if ( focusable ) {
					focusable.focus();
				}
			} );
		}

		if ( testBtn && testResult ) {
			testBtn.addEventListener( 'click', function () {
				runTest( form, testBtn, testResult );
			} );
		}
	}

	/**
	 * Run a test-connection REST request.
	 *
	 * @param {HTMLFormElement} form       Calendar form.
	 * @param {HTMLButtonElement} button   Trigger button.
	 * @param {HTMLElement} resultEl       Container for the result message.
	 */
	function runTest( form, button, resultEl ) {
		const calendarId = form.querySelector( '[name="calendar_id"]' );
		const sourceTypeEl = form.querySelector( 'input[name="source_type"]:checked' );
		const slugEl = form.querySelector( '[name="existing_slug"]' );
		const slug = slugEl ? slugEl.value : '';

		if ( ! calendarId || ! calendarId.value ) {
			showResult( resultEl, 'error', i18n.calendarIdRequired || 'Calendar ID is required.' );
			return;
		}
		if ( ! sourceTypeEl ) {
			showResult( resultEl, 'error', i18n.sourceTypeRequired || 'Choose a source type.' );
			return;
		}

		const sourceType = sourceTypeEl.value;
		let secretValue = '';
		const activeInput = form.querySelector( '[name="secret"]:not([disabled])' );
		if ( activeInput ) {
			secretValue = activeInput.value || '';
		}

		// If editing and the user has not pasted a new secret, use stored credentials.
		const useStored = secretValue === '' && slug !== '' ? slug : '';

		button.disabled = true;
		showResult( resultEl, 'pending', i18n.testing || 'Testing…' );

		const body = new FormData();
		body.append( 'calendar_id', calendarId.value );
		body.append( 'source_type', sourceType );
		body.append( 'secret', secretValue );
		body.append( 'use_stored', useStored );

		fetch( restRoot + '/test-connection', {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'X-WP-Nonce': nonce,
			},
			body: body,
		} )
			.then( function ( res ) {
				return res.json().catch( function () {
					return { ok: false, message: 'Invalid JSON in response.' };
				} );
			} )
			.then( function ( data ) {
				button.disabled = false;
				if ( data && data.ok ) {
					showSuccess( resultEl, data );
				} else {
					const baseMessage = ( data && data.message ) || ( i18n.testFailed || 'Test failed.' );
					showResult( resultEl, 'error', baseMessage );
					if ( data && ( data.debug_body || data.debug_endpoint || data.debug_url ) ) {
						appendDebugDetails( resultEl, data );
					}
				}
			} )
			.catch( function () {
				button.disabled = false;
				showResult( resultEl, 'error', i18n.networkError || 'Network error.' );
			} );
	}

	/**
	 * Render a successful test result with up to 3 sample event titles.
	 *
	 * @param {HTMLElement} el Result container.
	 * @param {Object}      data REST payload.
	 */
	function showSuccess( el, data ) {
		el.classList.remove( 'is-error', 'is-pending' );
		el.classList.add( 'is-success' );
		const eventCount = data.event_count || 0;
		const summary = ( i18n.testSuccess || '%d events found in the next 30 days.' ).replace( '%d', eventCount );

		let html = '<strong>' + escapeHtml( summary ) + '</strong>';
		if ( Array.isArray( data.preview ) && data.preview.length > 0 ) {
			html += '<ul class="sdaweb-gcal-test-preview">';
			data.preview.forEach( function ( ev ) {
				html += '<li>' + escapeHtml( ev.title || '(untitled)' ) + ' <span>' + escapeHtml( ev.start || '' ) + '</span></li>';
			} );
			html += '</ul>';
		}
		if ( data.service_email ) {
			html += '<p class="sdaweb-gcal-test-meta">' + escapeHtml( ( i18n.serviceEmail || 'Service account: %s' ).replace( '%s', data.service_email ) ) + '</p>';
		}
		el.innerHTML = html;
	}

	function showResult( el, kind, message ) {
		if ( ! el ) {
			return;
		}
		el.classList.remove( 'is-success', 'is-error', 'is-pending' );
		el.classList.add( 'is-' + kind );
		el.textContent = message;
	}

	function appendDebugDetails( el, data ) {
		if ( ! el ) {
			return;
		}
		const wrap = document.createElement( 'details' );
		wrap.className = 'sdaweb-gcal-test-debug';
		const summary = document.createElement( 'summary' );
		summary.textContent = i18n.debugDetails || 'Debug (WP_DEBUG)';
		wrap.appendChild( summary );
		const pre = document.createElement( 'pre' );
		const lines = [];
		if ( data.debug_endpoint ) {
			lines.push( 'endpoint: ' + data.debug_endpoint );
		}
		if ( data.debug_url ) {
			lines.push( 'url: ' + data.debug_url );
		}
		if ( data.debug_body ) {
			lines.push( 'body:' );
			lines.push( data.debug_body );
		}
		pre.textContent = lines.join( '\n' );
		wrap.appendChild( pre );
		el.appendChild( wrap );
	}

	function toggle( el, visible ) {
		if ( ! el ) {
			return;
		}
		el.hidden = ! visible;
	}

	function escapeHtml( str ) {
		return String( str )
			.replace( /&/g, '&amp;' )
			.replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' )
			.replace( /"/g, '&quot;' )
			.replace( /'/g, '&#039;' );
	}

	/**
	 * "Refresh now" buttons in the calendar list.
	 */
	function initRefreshButtons() {
		const buttons = document.querySelectorAll( '[data-sdaweb-gcal-refresh]' );
		buttons.forEach( function ( btn ) {
			btn.addEventListener( 'click', function () {
				const slug = btn.getAttribute( 'data-sdaweb-gcal-refresh' );
				if ( ! slug ) {
					return;
				}
				btn.disabled = true;
				const original = btn.textContent;
				btn.textContent = i18n.refreshing || 'Refreshing…';

				fetch( restRoot + '/calendars/' + encodeURIComponent( slug ) + '/refresh', {
					method: 'POST',
					credentials: 'same-origin',
					headers: { 'X-WP-Nonce': nonce },
				} )
					.then( function ( res ) {
						return res.json().catch( function () {
							return { ok: false };
						} );
					} )
					.then( function ( data ) {
						btn.disabled = false;
						if ( data && data.ok ) {
							var eventLabel = ( i18n.refreshDone || '%d events' ).replace( '%d', data.event_count || 0 );
							var depCount = parseInt( data.dependent_display_count, 10 ) || 0;
							if ( depCount > 0 ) {
								// Single line: "47 events · 2 displays will re-render"
								// i18n.cascadeNotice is a template containing %d; falls back to a plain English
								// pluralisation so untranslated sites still surface the count.
								var cascadeTemplate = i18n.cascadeNotice ||
									( depCount === 1 ? '%d display will re-render' : '%d displays will re-render' );
								eventLabel += ' · ' + cascadeTemplate.replace( '%d', depCount );
							}
							btn.textContent = eventLabel;
							setTimeout( function () {
								window.location.reload();
							}, 1200 );
						} else {
							btn.textContent = original;
							alert( ( data && data.message ) || ( i18n.refreshFailed || 'Refresh failed.' ) );
						}
					} )
					.catch( function () {
						btn.disabled = false;
						btn.textContent = original;
					} );
			} );
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
