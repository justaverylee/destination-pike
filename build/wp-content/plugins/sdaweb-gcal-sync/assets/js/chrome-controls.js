/**
 * SDAweb Calendar Sync — chrome controls (live search + date jump-to picker).
 *
 * Both controls are tiny — combined here to avoid two extra HTTP requests.
 * Search is pure client-side filtering: hide chips whose text doesn't match.
 * Date picker navigates to ?sdaweb_gcal_focus=YYYY-MM-DD and lets the server
 * re-render against the new anchor.
 */
( function () {
	'use strict';

	function init() {
		bindSearch();
		bindDateJump();
	}

	/* ----- Live search ----- */

	function bindSearch() {
		var blocks = document.querySelectorAll( '[data-sdaweb-gcal-search]' );
		Array.prototype.forEach.call( blocks, function ( block ) {
			var input  = block.querySelector( '[data-sdaweb-gcal-search-input]' );
			var clear  = block.querySelector( '[data-sdaweb-gcal-search-clear]' );
			var toggle = block.querySelector( '[data-sdaweb-gcal-search-toggle]' );
			if ( ! input ) {
				return;
			}
			// Search scope = the nearest .sdaweb-gcal wrapper above us.
			var scope = block.closest( '.sdaweb-gcal' ) || document;

			// Sync the clear button's visibility with input value. Use both
			// `hidden` attribute (so [hidden] CSS selector catches it) AND
			// just to be safe, no inline style — keeps the toggle robust
			// against theme `display:` overrides on `[hidden]`.
			function syncClearVisibility() {
				if ( ! clear ) {
					return;
				}
				if ( input.value ) {
					clear.removeAttribute( 'hidden' );
				} else {
					clear.setAttribute( 'hidden', '' );
				}
			}
			syncClearVisibility();

			var debounce = null;
			input.addEventListener( 'input', function () {
				syncClearVisibility();
				window.clearTimeout( debounce );
				debounce = window.setTimeout( function () {
					applyMatches( scope, input.value );
				}, 80 );
			} );

			if ( clear ) {
				clear.addEventListener( 'click', function () {
					input.value = '';
					syncClearVisibility();
					applyMatches( scope, '' );
					input.focus();
				} );
			}

			/*
			 * Inline-expand for narrow titlebars. The container query in
			 * front.css collapses search to icon-only below 480px container
			 * width — the toggle is the only visible affordance there, and
			 * the input is hidden via CSS. Clicking the toggle adds
			 * `is-expanded` to the wrapper, which the CSS uses to flip the
			 * input back in and hide the toggle. Wider screens never collapse
			 * to icon-only, so the toggle button stays `display: none` and
			 * the click path is dead code — no JS-detected breakpoint needed.
			 */
			if ( toggle ) {
				toggle.addEventListener( 'click', function () {
					block.classList.add( 'is-expanded' );
					toggle.setAttribute( 'aria-expanded', 'true' );
					// Defer focus until after the layout shift settles so
					// the caret lands inside the now-visible input.
					window.setTimeout( function () { input.focus(); }, 0 );
				} );

				// Collapse on ESC (only when the input is empty — preserve
				// the current query if the visitor is mid-search).
				input.addEventListener( 'keydown', function ( e ) {
					if ( ( e.key === 'Escape' || e.key === 'Esc' ) && ! input.value ) {
						block.classList.remove( 'is-expanded' );
						toggle.setAttribute( 'aria-expanded', 'false' );
						toggle.focus();
					}
				} );

				// Collapse on blur, but only when input is empty AND focus
				// isn't moving to the clear button (which would re-empty it).
				input.addEventListener( 'blur', function ( e ) {
					if ( input.value ) {
						return;
					}
					var next = e.relatedTarget;
					if ( next && block.contains( next ) ) {
						return;
					}
					block.classList.remove( 'is-expanded' );
					toggle.setAttribute( 'aria-expanded', 'false' );
				} );
			}
		} );
	}

	/* Walk every chip-bearing element across all view types in this scope. */
	function allChips( scope ) {
		return scope.querySelectorAll(
			'[data-sdaweb-gcal-event-id]'
		);
	}

	/*
	 * Apply highlight-match: matching chips get `is-search-match`, non-
	 * matching lose it. The wrapper gets `sdaweb-gcal--searching` so CSS
	 * can fade non-matching chips into context. Both are unconditionally
	 * cleared first so a stale highlight from a previous query never sticks.
	 */
	function applyMatches( scope, query ) {
		var chips = allChips( scope );
		Array.prototype.forEach.call( chips, function ( chip ) {
			chip.classList.remove( 'is-search-match' );
		} );

		var q = ( query || '' ).toLowerCase().trim();
		if ( ! q ) {
			scope.classList.remove( 'sdaweb-gcal--searching' );
			return;
		}

		scope.classList.add( 'sdaweb-gcal--searching' );
		Array.prototype.forEach.call( chips, function ( chip ) {
			var hay = ( chip.textContent || '' ).toLowerCase();
			var title = chip.getAttribute( 'title' ) || chip.dataset.sdawebGcalTitleStash || '';
			if ( title ) {
				hay += ' ' + title.toLowerCase();
			}
			if ( hay.indexOf( q ) !== -1 ) {
				chip.classList.add( 'is-search-match' );
			}
		} );
	}

	/* ----- Date jump-to picker ----- */

	function bindDateJump() {
		var inputs = document.querySelectorAll( '[data-sdaweb-gcal-date-jump-input]' );
		Array.prototype.forEach.call( inputs, function ( input ) {
			input.addEventListener( 'change', function () {
				var v = input.value;
				if ( ! /^\d{4}-\d{2}-\d{2}$/.test( v ) ) {
					return;
				}
				// Scope the URL to this display's slug so the focus override
				// only applies to the calendar whose date-jump was used —
				// matches the server-side rule that an unscoped focus is
				// ignored. Without this scope, picking a date in the main
				// calendar would also jump every other calendar on the
				// page (footer widget, sidebar, etc.) to the same date.
				var chrome = input.closest( '[data-sdaweb-gcal-chrome]' );
				var slug   = chrome ? chrome.getAttribute( 'data-sdaweb-gcal-display-slug' ) : '';
				var url    = new URL( window.location.href );
				// Clear any stale scope before setting fresh values.
				url.searchParams.delete( 'sdaweb_gcal_focus' );
				url.searchParams.delete( 'sdaweb_gcal_id' );
				url.searchParams.set( 'sdaweb_gcal_focus', v );
				if ( slug ) {
					url.searchParams.set( 'sdaweb_gcal_id', slug );
				}
				window.location.href = url.toString();
			} );
		} );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}

	// v0.13.2: re-run init() after swap.js replaces inner HTML. Search inputs
	// and date-jump inputs live inside the swapped content; the original nodes
	// (and their listeners) are destroyed by the innerHTML replace, so
	// rebinding to the new nodes is required.
	document.addEventListener( 'sdaweb-gcal:viewchanged', init );
}() );
