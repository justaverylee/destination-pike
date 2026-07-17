/* global sdawebGcalEventHoverL10n */
/**
 * SDAweb Calendar Sync — event popover.
 *
 * One popover per display, surfaces date / title / time / location / description
 * / calendar identifier / recurrence info next to the chip.
 *
 * Two interaction models, picked from `(hover: hover) and (pointer: fine)`:
 *
 *   - Hover devices (desktop): mouseover/focus opens the popover, mouseleave
 *     dismisses. Clicking the chip navigates as a normal link.
 *   - Touch devices (phones, tablets, iPad without trackpad): tap on the chip
 *     opens the popover and suppresses the native navigation; the popover's
 *     own title link handles the navigate-to-Google-Calendar action. Tap
 *     elsewhere (or on another chip) closes / switches.
 */
( function () {
	'use strict';

	var L10N = ( typeof window.sdawebGcalEventHoverL10n === 'object' && window.sdawebGcalEventHoverL10n ) || {
		open: 'Open event',
		all_day: 'All day',
	};

	var isTouch = ! ( window.matchMedia && window.matchMedia( '(hover: hover) and (pointer: fine)' ).matches );

	// 0.22.0: tap-to-open on touch is now opt-in per display (event_hover_touch)
	// AND limited to tablet-sized screens. The phone band mirrors the Month→Mini
	// auto-degrade trigger in view-month.css (≤600px, plus phones held in
	// landscape) so phones keep the click-through path and never get the popover.
	function isTabletTouch() {
		if ( ! window.matchMedia ) {
			return false;
		}
		return ! window.matchMedia(
			'(max-width: 600px), (orientation: landscape) and (max-height: 500px)'
		).matches;
	}

	// Whether a tap on this chip should open the popover (and suppress the chip's
	// own navigation) instead of letting the link through. True only when the
	// owning display opted in and we're on a tablet-or-larger touch screen.
	function touchTapAllowed( chip ) {
		var displayId = chip.getAttribute( 'data-sdaweb-gcal-display-id' );
		var entry = registry[ displayId ];
		if ( ! entry || ! entry.payload || ! entry.payload.touch ) {
			return false;
		}
		return isTabletTouch();
	}

	// Mirrors Views\Event_Link::icon() so the shared .sdaweb-gcal-event-info-icon
	// CSS styles it identically. Constant markup, no user data — safe innerHTML.
	function buildInfoIcon() {
		var span = document.createElement( 'span' );
		span.className = 'sdaweb-gcal-event-info-icon';
		span.setAttribute( 'aria-hidden', 'true' );
		span.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
		return span;
	}

	var registry = {}; // displayId → { payload, popoverEl, currentChip }

	// v0.13.2: split init() so the document/window listeners attach exactly
	// once (preventing duplicate-fire after swap re-init) while the registry
	// rebuild runs both on first load AND on every viewchanged event.
	var globalListenersBound = false;

	function init() {
		rebuildRegistry();
		if ( globalListenersBound ) {
			return;
		}
		globalListenersBound = true;

		// Always bind hover/focus — they're cheap and harmless on touch (the
		// events simply never fire). Always bind tap handlers too — desktop
		// users with a mouse won't trigger touchend, and click on desktop is
		// allowed to navigate via the chip's <a> normally because tap logic
		// gates on event.pointerType when available.
		document.addEventListener( 'mouseover', onPointerEnter, true );
		document.addEventListener( 'mouseout', onPointerLeave, true );
		document.addEventListener( 'focusin', onFocusIn, true );
		document.addEventListener( 'focusout', onFocusOut, true );
		// Suppress the synthesized click on the chip's <a> by preventDefault'ing
		// touchend in the capture phase. iOS Safari ignores capture-phase
		// preventDefault on `click` for some <a> taps in landscape — the
		// touchend hook fires earlier and blocks reliably.
		document.addEventListener( 'touchend', onTouchEndDelegated, { capture: true, passive: false } );
		document.addEventListener( 'click', onClickDelegated, true );

		document.addEventListener( 'keydown', onKeyDown );
		window.addEventListener( 'scroll', onScroll, { passive: true, capture: true } );
		window.addEventListener( 'resize', onScroll, { passive: true } );
	}

	function rebuildRegistry() {
		var dataNodes = document.querySelectorAll( '[data-sdaweb-gcal-event-hover-data]' );
		Array.prototype.forEach.call( dataNodes, function ( node ) {
			var displayId = node.getAttribute( 'data-display-id' ) || '';
			if ( ! displayId ) {
				return;
			}
			var payload = {};
			try {
				payload = JSON.parse( node.textContent || '{}' );
			} catch ( e ) {
				payload = {};
			}
			registry[ displayId ] = {
				payload: payload,
				popoverEl: null,
				currentChip: null,
			};
		} );
	}

	// Records whether the most recent activation came from touch — used by the
	// click handler to decide whether to suppress nav (touch) or pass through
	// to the chip's link (mouse on desktop / iPad with trackpad).
	var lastTouchTimestamp = 0;

	function isRecentTouch() {
		return ( Date.now() - lastTouchTimestamp ) < 600;
	}

	function onTouchEndDelegated( event ) {
		// Inside the popover? Let the popover's own links handle the tap.
		if ( event.target && event.target.closest && event.target.closest( '.sdaweb-gcal-event-hover' ) ) {
			return;
		}
		var chip = findChip( event.target );
		if ( ! chip ) {
			// Tap on bare page — close any open popover. Stamp the timestamp so
			// the synthesized click doesn't immediately reopen anything.
			lastTouchTimestamp = Date.now();
			Object.keys( registry ).forEach( hideFor );
			return;
		}
		// 0.22.0: only intercept when this display opted into tablet tap-to-open
		// and we're on a tablet-sized touch screen. Otherwise leave the tap alone
		// — the chip's own <a> navigates (or, with links off, nothing happens),
		// exactly as before. We must NOT stamp lastTouchTimestamp here, or the
		// follow-up click handler would wrongly suppress that navigation.
		if ( ! touchTapAllowed( chip ) ) {
			return;
		}
		lastTouchTimestamp = Date.now();
		// Block the synthesized click that would otherwise navigate the chip.
		if ( event.cancelable ) {
			event.preventDefault();
		}
		handleChipActivation( chip );
	}

	function onClickDelegated( event ) {
		// Inside popover — let through.
		if ( event.target && event.target.closest && event.target.closest( '.sdaweb-gcal-event-hover' ) ) {
			return;
		}
		var chip = findChip( event.target );

		// Critical: if touchend just fired (within ~600ms) it already handled
		// activation. The click that follows on iOS / Android must NOT re-call
		// handleChipActivation — that would toggle the just-opened popover
		// closed. Just suppress the chip's <a> navigation as a safety net and
		// bail. Symptom this fixes (0.4.20): popover briefly flickered open
		// then closed on landscape mobile, looking like "nothing happened".
		if ( isRecentTouch() ) {
			if ( chip && event.cancelable ) {
				event.preventDefault();
				event.stopPropagation();
			}
			return;
		}

		if ( ! chip ) {
			// Pure-mouse click off-chip on a non-hover device (rare — pure
			// touch with synthesized click but no touchend, e.g. AssistiveTouch).
			if ( isTouch ) {
				Object.keys( registry ).forEach( hideFor );
			}
			return;
		}
		// Desktop mouse click on a chip should navigate normally — the user
		// already saw the popover via hover. Only intercept when the device
		// has no hover capability at all (and this click came without a
		// preceding touchend — handled above).
		if ( ! isTouch ) {
			return;
		}
		// 0.22.0: same opt-in + tablet gate as the touchend path. On a touch
		// device that doesn't fire touchend (or an opted-out / phone-sized one)
		// let the link navigate instead of opening the popover.
		if ( ! touchTapAllowed( chip ) ) {
			return;
		}
		if ( event.cancelable ) {
			event.preventDefault();
		}
		event.stopPropagation();
		handleChipActivation( chip );
	}

	function handleChipActivation( chip ) {
		var displayId = chip.getAttribute( 'data-sdaweb-gcal-display-id' );
		var entry = registry[ displayId ];
		if ( entry && entry.currentChip === chip && entry.popoverEl && entry.popoverEl.classList.contains( 'is-open' ) ) {
			// Tapping the same chip twice closes the popover.
			hideFor( displayId );
			return;
		}
		// Switching chip — close any other popover first so we don't stack.
		Object.keys( registry ).forEach( function ( id ) {
			if ( id !== displayId ) {
				hideFor( id );
			}
		} );
		showFor( chip );
	}

	function findChip( target ) {
		if ( ! target || ! target.closest ) {
			return null;
		}
		return target.closest( '[data-sdaweb-gcal-event-id][data-sdaweb-gcal-display-id]' );
	}

	function onPointerEnter( event ) {
		var chip = findChip( event.target );
		if ( ! chip ) {
			return;
		}
		showFor( chip );
	}

	function onPointerLeave( event ) {
		var chip = findChip( event.target );
		if ( ! chip ) {
			return;
		}
		// Don't dismiss if mouse moved into the popover itself.
		var related = event.relatedTarget;
		if ( related && related.closest && related.closest( '.sdaweb-gcal-event-hover' ) ) {
			return;
		}
		hideFor( chip.getAttribute( 'data-sdaweb-gcal-display-id' ) );
	}

	function onFocusIn( event ) {
		var chip = findChip( event.target );
		if ( ! chip ) {
			return;
		}
		showFor( chip );
	}

	function onFocusOut( event ) {
		var chip = findChip( event.target );
		if ( ! chip ) {
			return;
		}
		hideFor( chip.getAttribute( 'data-sdaweb-gcal-display-id' ) );
	}

	function onKeyDown( event ) {
		if ( event.key !== 'Escape' ) {
			return;
		}
		Object.keys( registry ).forEach( function ( id ) {
			hideFor( id );
		} );
	}

	function onScroll() {
		Object.keys( registry ).forEach( function ( id ) {
			var entry = registry[ id ];
			if ( entry.popoverEl && entry.popoverEl.classList.contains( 'is-open' ) && entry.currentChip ) {
				position( entry.popoverEl, entry.currentChip );
			}
		} );
	}

	function showFor( chip ) {
		var displayId = chip.getAttribute( 'data-sdaweb-gcal-display-id' );
		var eventId = chip.getAttribute( 'data-sdaweb-gcal-event-id' );
		var entry = registry[ displayId ];
		if ( ! entry || ! entry.payload || ! entry.payload.events ) {
			return;
		}
		var data = entry.payload.events[ eventId ];
		if ( ! data ) {
			return;
		}

		// Create popover lazily on first use; reuse thereafter.
		if ( ! entry.popoverEl ) {
			entry.popoverEl = createPopover( displayId );
			document.body.appendChild( entry.popoverEl );
		}

		// 0.22.0: mark popovers belonging to a tablet-opted-in display so the
		// touch CSS backstop (event-hover.css) lets them render. Body-level
		// element, so the per-display flag has to ride on the element itself.
		entry.popoverEl.classList.toggle( 'sdaweb-gcal-touch-tap', !! entry.payload.touch );

		render( entry.popoverEl, data, entry.payload.mode || 'rich' );
		entry.currentChip = chip;
		// Suppress native title="" tooltip while popover is open — otherwise
		// browsers stack ours on top of theirs. Restore on hide.
		if ( ! chip.dataset.sdawebGcalTitleStash ) {
			var title = chip.getAttribute( 'title' );
			if ( title ) {
				chip.dataset.sdawebGcalTitleStash = title;
				chip.removeAttribute( 'title' );
			}
		}
		entry.popoverEl.hidden = false;
		// Force layout so the entry transition runs.
		// eslint-disable-next-line no-unused-expressions
		entry.popoverEl.offsetHeight;
		position( entry.popoverEl, chip );
		entry.popoverEl.classList.add( 'is-open' );
		chip.setAttribute( 'aria-describedby', entry.popoverEl.id );
	}

	function hideFor( displayId ) {
		var entry = registry[ displayId ];
		if ( ! entry || ! entry.popoverEl ) {
			return;
		}
		entry.popoverEl.classList.remove( 'is-open' );
		var chip = entry.currentChip;
		if ( chip && chip.dataset.sdawebGcalTitleStash ) {
			chip.setAttribute( 'title', chip.dataset.sdawebGcalTitleStash );
			delete chip.dataset.sdawebGcalTitleStash;
		}
		if ( chip ) {
			chip.removeAttribute( 'aria-describedby' );
		}
		entry.currentChip = null;
		// Hide after fade-out so it doesn't intercept pointer events.
		var pop = entry.popoverEl;
		window.setTimeout( function () {
			if ( ! pop.classList.contains( 'is-open' ) ) {
				pop.hidden = true;
			}
		}, 200 );
	}

	function createPopover( displayId ) {
		var el = document.createElement( 'div' );
		el.className = 'sdaweb-gcal-event-hover';
		el.id = 'sdaweb-gcal-event-hover-' + displayId;
		el.setAttribute( 'role', 'tooltip' );
		el.hidden = true;

		var caret = document.createElement( 'span' );
		caret.className = 'sdaweb-gcal-event-hover__caret';
		el.appendChild( caret );

		var header = document.createElement( 'div' );
		header.className = 'sdaweb-gcal-event-hover__header';
		var dot = document.createElement( 'span' );
		dot.className = 'sdaweb-gcal-event-hover__cal-dot';
		dot.setAttribute( 'aria-hidden', 'true' );
		header.appendChild( dot );
		var date = document.createElement( 'span' );
		date.className = 'sdaweb-gcal-event-hover__date';
		header.appendChild( date );
		el.appendChild( header );

		var body = document.createElement( 'div' );
		body.className = 'sdaweb-gcal-event-hover__body';
		el.appendChild( body );

		// Keep popover open while pointer is over it (allows clicking inside).
		el.addEventListener( 'mouseenter', function () {
			el.classList.add( 'is-open' );
		} );
		el.addEventListener( 'mouseleave', function () {
			hideFor( displayId );
		} );

		return el;
	}

	function render( popover, data, mode ) {
		var dotEl = popover.querySelector( '.sdaweb-gcal-event-hover__cal-dot' );
		var dateEl = popover.querySelector( '.sdaweb-gcal-event-hover__date' );
		var body = popover.querySelector( '.sdaweb-gcal-event-hover__body' );

		if ( dotEl ) {
			if ( data.calendar_color ) {
				popover.style.setProperty( '--sdaweb-gcal-event-color', data.calendar_color );
			} else {
				popover.style.removeProperty( '--sdaweb-gcal-event-color' );
			}
		}
		if ( dateEl ) {
			dateEl.textContent = data.date_label || '';
		}

		while ( body.firstChild ) {
			body.removeChild( body.firstChild );
		}

		// 0.22.0: whole-card click target. Flag the popover as linked so the
		// CSS stretched-link overlay (event-hover.css) extends the title
		// anchor's hit area across the entire card — a bigger tap target on
		// touch, where the second tap follows the link. No effect when the
		// event has no link (the class is removed and no anchor is rendered).
		popover.classList.toggle( 'is-linked', !! data.url );

		// Title + link
		var title = document.createElement( 'h5' );
		title.className = 'sdaweb-gcal-event-hover__title';
		if ( data.url ) {
			var a = document.createElement( 'a' );
			a.href = data.url;
			// Honour the display's link-target setting (custom links use
			// "Open custom links in", Google links use "Open event links in").
			// The payload's `newtab` already encodes that decision server-side
			// via Event_Link::opens_new_tab(), so this surface now matches the
			// chip anchors and every other view instead of always new-tabbing.
			if ( data.newtab ) {
				a.target = '_blank';
				a.rel = 'noopener noreferrer';
			}
			a.title = L10N.open;
			// Prepend the info-icon cue when the link is an admin-chosen page,
			// mirroring the chip and the other JS-rendered popovers.
			if ( data.hasinfo ) {
				a.appendChild( buildInfoIcon() );
				a.appendChild( document.createTextNode( data.title || '' ) );
			} else {
				a.textContent = data.title || '';
			}
			title.appendChild( a );
		} else {
			title.textContent = data.title || '';
		}
		body.appendChild( title );

		if ( mode === 'minimal' ) {
			return;
		}

		// Time
		if ( data.time ) {
			var time = document.createElement( 'div' );
			time.className = 'sdaweb-gcal-event-hover__time';
			time.textContent = data.time;
			body.appendChild( time );
		}
		// Location
		if ( data.location ) {
			var loc = document.createElement( 'div' );
			loc.className = 'sdaweb-gcal-event-hover__location';
			loc.textContent = data.location;
			body.appendChild( loc );
		}
		// Calendar identifier
		if ( data.calendar_label ) {
			var cal = document.createElement( 'div' );
			cal.className = 'sdaweb-gcal-event-hover__calendar';
			cal.textContent = data.calendar_label;
			body.appendChild( cal );
		}
		// Recurrence
		if ( data.is_recurring && data.recurrence_summary ) {
			var rec = document.createElement( 'div' );
			rec.className = 'sdaweb-gcal-event-hover__recurrence';
			rec.textContent = data.recurrence_summary;
			body.appendChild( rec );
		}
		// Description
		if ( data.description ) {
			var desc = document.createElement( 'div' );
			desc.className = 'sdaweb-gcal-event-hover__description';
			desc.textContent = data.description;
			body.appendChild( desc );
		}
	}

	function position( popover, chip ) {
		var chipRect = chip.getBoundingClientRect();
		// Reset before measuring popover.
		popover.classList.remove( 'is-flipped' );
		popover.style.left = '0px';
		popover.style.top = '0px';

		var popRect = popover.getBoundingClientRect();
		var vw = window.innerWidth;
		var vh = window.innerHeight;
		var margin = 8;

		// Default: below the chip, horizontally centered.
		var top = chipRect.bottom + margin;
		var left = chipRect.left + ( chipRect.width / 2 ) - ( popRect.width / 2 );
		var flipped = false;

		// Flip above if it would overflow viewport bottom.
		if ( top + popRect.height > vh - margin ) {
			top = chipRect.top - popRect.height - margin;
			flipped = true;
		}
		// Clamp horizontally.
		if ( left < margin ) {
			left = margin;
		}
		if ( left + popRect.width > vw - margin ) {
			left = vw - popRect.width - margin;
		}

		popover.style.left = left + 'px';
		popover.style.top = top + 'px';
		if ( flipped ) {
			popover.classList.add( 'is-flipped' );
		}

		// Position the caret at the chip's horizontal center, clamped.
		var caret = popover.querySelector( '.sdaweb-gcal-event-hover__caret' );
		if ( caret ) {
			var caretX = ( chipRect.left + chipRect.width / 2 ) - left - 6;
			caretX = Math.max( 12, Math.min( popRect.width - 24, caretX ) );
			caret.style.left = caretX + 'px';
		}
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}

	// v0.13.2: rebuild the hover-payload registry after each swap. New
	// `[data-sdaweb-gcal-event-hover-data]` JSON islands arrive inside the
	// swapped innerHTML; without this, the registry keeps the previous view's
	// events and hovers on the new view's chips find no payload.
	document.addEventListener( 'sdaweb-gcal:viewchanged', rebuildRegistry );
}() );
