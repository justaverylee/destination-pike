/**
 * SDAweb Calendar Sync — Month-view "+N more" overflow popover.
 *
 * When a day cell has more events than the cell can show, the renderer
 * emits a <button class="sdaweb-gcal-month__overflow-trigger"> alongside
 * a <script type="application/json"> payload of that day's events. This
 * script wires up:
 *   - click on trigger → populate + position + reveal popover
 *   - Escape, click-outside, close-button → dismiss + restore focus
 *   - aria-expanded toggling on trigger
 *   - first-focusable focus on open
 *
 * One popover container per rendered display, scoped under the
 * .sdaweb-gcal--month wrapper. No global singleton, no body append —
 * keeps the CSS variable cascade (theme overrides, dark-mode overlay)
 * intact for the popover.
 *
 * Loaded only when the active overflow_action = 'popover' (default).
 * The Day-link mode ships zero JS.
 *
 * @package SDAweb\GCalSync
 */

( function () {
	'use strict';

	function init() {
		var wrappers = document.querySelectorAll( '.sdaweb-gcal--month' );
		Array.prototype.forEach.call( wrappers, bindWrapper );
	}

	function bindWrapper( wrapper ) {
		// v0.13.2: idempotency flag so re-init after a swap doesn't double-bind
		// listeners to the persistent .sdaweb-gcal--month root. The popover
		// reference is re-queried lazily inside each handler instead of being
		// captured in closure at bind time, so the new popover element that
		// arrives with the swapped innerHTML is picked up automatically.
		if ( wrapper._sdawebGcalMonthOverflowBound ) {
			return;
		}
		var initialPopover = wrapper.querySelector( '[data-sdaweb-gcal-month-overflow-popover]' );
		if ( ! initialPopover ) {
			return;
		}
		wrapper._sdawebGcalMonthOverflowBound = true;

		function currentPopover() {
			return wrapper.querySelector( '[data-sdaweb-gcal-month-overflow-popover]' );
		}

		wrapper.addEventListener( 'click', function ( event ) {
			var popover = currentPopover();
			if ( ! popover ) {
				return;
			}
			var trigger = event.target.closest( '.sdaweb-gcal-month__overflow-trigger' );
			if ( trigger && wrapper.contains( trigger ) ) {
				event.preventDefault();
				openPopover( wrapper, popover, trigger );
				return;
			}
			var closeBtn = event.target.closest( '[data-sdaweb-gcal-month-overflow-close]' );
			if ( closeBtn && popover.contains( closeBtn ) ) {
				event.preventDefault();
				closePopover( wrapper, popover );
			}
		} );

		document.addEventListener( 'keydown', function ( event ) {
			var popover = currentPopover();
			if ( ! popover ) {
				return;
			}
			if ( 'Escape' === event.key && ! popover.hasAttribute( 'hidden' ) ) {
				closePopover( wrapper, popover );
			}
		} );

		document.addEventListener( 'click', function ( event ) {
			var popover = currentPopover();
			if ( ! popover ) {
				return;
			}
			if ( popover.hasAttribute( 'hidden' ) ) {
				return;
			}
			if ( popover.contains( event.target ) ) {
				return;
			}
			if ( event.target.closest( '.sdaweb-gcal-month__overflow-trigger' ) ) {
				// The trigger handler manages its own click; don't double-close.
				return;
			}
			closePopover( wrapper, popover );
		}, true );

		// Reposition on resize/scroll while open so the popover stays anchored.
		window.addEventListener( 'resize', function () {
			var popover = currentPopover();
			if ( ! popover ) {
				return;
			}
			if ( ! popover.hasAttribute( 'hidden' ) && wrapper._sdawebGcalMonthOverflowTrigger ) {
				positionPopover( popover, wrapper._sdawebGcalMonthOverflowTrigger );
			}
		} );
	}

	function openPopover( wrapper, popover, trigger ) {
		var dayKey   = trigger.getAttribute( 'data-sdaweb-gcal-month-overflow-day' );
		var heading  = trigger.getAttribute( 'data-sdaweb-gcal-month-overflow-heading' ) || '';
		var dataNode = trigger.parentNode && trigger.parentNode.querySelector(
			'script[data-sdaweb-gcal-month-overflow-data="' + cssEscape( dayKey ) + '"]'
		);
		if ( ! dataNode ) {
			return;
		}

		var events;
		try {
			events = JSON.parse( dataNode.textContent || '[]' );
		} catch ( err ) {
			return;
		}

		var titleEl = popover.querySelector( '[data-sdaweb-gcal-month-overflow-title]' );
		if ( titleEl ) {
			titleEl.textContent = heading;
		}

		var listEl = popover.querySelector( '[data-sdaweb-gcal-month-overflow-list]' );
		if ( listEl ) {
			listEl.textContent = '';
			Array.prototype.forEach.call( events, function ( ev ) {
				listEl.appendChild( buildEventNode( ev ) );
			} );
		}

		// Reveal first (so we can measure), then position.
		popover.removeAttribute( 'hidden' );
		positionPopover( popover, trigger );

		// Track for resize handler + focus restoration.
		wrapper._sdawebGcalMonthOverflowReturnFocus = trigger;
		wrapper._sdawebGcalMonthOverflowTrigger     = trigger;
		trigger.setAttribute( 'aria-expanded', 'true' );

		var firstFocusable = popover.querySelector( 'a, button, [tabindex]:not([tabindex="-1"])' );
		if ( firstFocusable ) {
			firstFocusable.focus();
		}
	}

	function closePopover( wrapper, popover ) {
		popover.setAttribute( 'hidden', '' );
		var triggers = wrapper.querySelectorAll(
			'.sdaweb-gcal-month__overflow-trigger[aria-expanded="true"]'
		);
		Array.prototype.forEach.call( triggers, function ( t ) {
			t.setAttribute( 'aria-expanded', 'false' );
		} );
		var returnTo = wrapper._sdawebGcalMonthOverflowReturnFocus;
		wrapper._sdawebGcalMonthOverflowReturnFocus = null;
		wrapper._sdawebGcalMonthOverflowTrigger     = null;
		if ( returnTo ) {
			returnTo.focus();
		}
	}

	function positionPopover( popover, trigger ) {
		var rect = trigger.getBoundingClientRect();
		var vh   = window.innerHeight || document.documentElement.clientHeight;
		var vw   = window.innerWidth  || document.documentElement.clientWidth;

		// Pre-measure with the popover off-screen but visible.
		popover.style.visibility = 'hidden';
		popover.style.position   = 'fixed';
		popover.style.top        = '0px';
		popover.style.left       = '0px';
		popover.style.maxHeight  = ( Math.min( 480, vh - 16 ) ) + 'px';
		var pop = popover.getBoundingClientRect();
		popover.style.visibility = '';

		var spaceBelow = vh - rect.bottom;
		var spaceAbove = rect.top;
		var top, left;

		if ( spaceBelow >= pop.height + 8 || spaceBelow >= spaceAbove ) {
			top = rect.bottom + 6;
		} else {
			top = Math.max( 8, rect.top - pop.height - 6 );
		}

		left = rect.left;
		if ( left + pop.width + 8 > vw ) {
			left = vw - pop.width - 8;
		}
		if ( left < 8 ) {
			left = 8;
		}

		popover.style.top  = top + 'px';
		popover.style.left = left + 'px';
	}

	function buildInfoIcon() {
		// Mirrors Views\Event_Link::icon() so the shared
		// .sdaweb-gcal-event-info-icon CSS styles it identically. Constant
		// markup with no user data — safe to assign via innerHTML.
		var span = document.createElement( 'span' );
		span.className = 'sdaweb-gcal-event-info-icon';
		span.setAttribute( 'aria-hidden', 'true' );
		span.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
		return span;
	}

	function buildEventNode( ev ) {
		var li = document.createElement( 'li' );
		li.className = 'sdaweb-gcal-month__overflow-popover-item';
		if ( ev.color ) {
			li.style.setProperty( '--sdaweb-gcal-event-color', ev.color );
		}

		var inner;
		if ( ev.url ) {
			inner = document.createElement( 'a' );
			inner.href      = ev.url;
			if ( ev.newtab ) {
				inner.target = '_blank';
				inner.rel    = 'noopener noreferrer';
			}
			inner.className = 'sdaweb-gcal-month__overflow-popover-link';
		} else {
			inner = document.createElement( 'div' );
			inner.className = 'sdaweb-gcal-month__overflow-popover-link';
		}

		if ( ev.time ) {
			var time = document.createElement( 'span' );
			time.className   = 'sdaweb-gcal-month__overflow-popover-time';
			time.textContent = ev.time;
			inner.appendChild( time );
		}

		var title = document.createElement( 'span' );
		title.className   = 'sdaweb-gcal-month__overflow-popover-event-title';
		if ( ev.hasinfo ) {
			title.appendChild( buildInfoIcon() );
			title.appendChild( document.createTextNode( ev.title || '' ) );
		} else {
			title.textContent = ev.title || '';
		}
		inner.appendChild( title );

		if ( ev.location ) {
			var loc = document.createElement( 'span' );
			loc.className   = 'sdaweb-gcal-month__overflow-popover-location';
			loc.textContent = ev.location;
			inner.appendChild( loc );
		}

		li.appendChild( inner );
		return li;
	}

	// Minimal CSS.escape polyfill — IE11 not a target, but Safari < 14 missed
	// CSS.escape on some surfaces. Day keys are ISO dates so the strict
	// escaping here is overkill but cheap and defensive.
	function cssEscape( value ) {
		if ( typeof window.CSS !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function' ) {
			return window.CSS.escape( value );
		}
		return String( value ).replace( /["'\\]/g, '\\$&' );
	}

	if ( 'loading' === document.readyState ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}

	// v0.13.2: re-run init() after swap.js replaces inner HTML. The flag in
	// bindWrapper() prevents double-binding to a wrapper that already has
	// listeners, but the popover element inside the wrapper is fresh after a
	// swap — handlers re-query it lazily so no further work is needed here.
	document.addEventListener( 'sdaweb-gcal:viewchanged', init );
} )();
