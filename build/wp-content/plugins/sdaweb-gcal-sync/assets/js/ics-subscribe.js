/* global sdawebGcalIcsL10n */
/**
 * SDAweb Calendar Sync — ICS subscribe popover.
 *
 * Wires up the subscribe pill: open/close, focus trap, outside-click + Esc to
 * close, copy-to-clipboard with toast, Android intent fallback to the Google
 * web URL when the intent scheme is unsupported, and bottom-sheet variant on
 * narrow screens.
 *
 * Server-rendered markup is the source of truth — this script only adds
 * behavior; the popover is fully usable as a "click → open the destination"
 * link list even with JS disabled (anchors carry the real URLs).
 */
( function () {
	'use strict';

	var L10N = ( typeof window.sdawebGcalIcsL10n === 'object' && window.sdawebGcalIcsL10n ) || {
		copied: 'Copied!',
		copy_failed: 'Copy failed',
		subscribe: 'Subscribe',
	};

	var SHEET_BREAKPOINT = 600;
	var openInstance = null;

	function init() {
		var roots = document.querySelectorAll( '[data-sdaweb-gcal-ics]' );
		Array.prototype.forEach.call( roots, setup );
	}

	function setup( root ) {
		if ( root.__sdawebGcalIcsBound ) {
			return;
		}
		root.__sdawebGcalIcsBound = true;

		var trigger = root.querySelector( '[data-sdaweb-gcal-ics-trigger]' );
		var popover = root.querySelector( '[data-sdaweb-gcal-ics-popover]' );
		var closeBtn = root.querySelector( '[data-sdaweb-gcal-ics-close]' );

		if ( ! trigger || ! popover ) {
			return;
		}

		applyViewportClass( root );
		window.addEventListener( 'resize', function () {
			applyViewportClass( root );
		}, { passive: true } );

		trigger.addEventListener( 'click', function ( event ) {
			event.preventDefault();
			toggle( root, trigger, popover );
		} );

		if ( closeBtn ) {
			closeBtn.addEventListener( 'click', function ( event ) {
				event.preventDefault();
				close( root, trigger, popover );
				trigger.focus();
			} );
		}

		// Click outside to close.
		document.addEventListener( 'click', function ( event ) {
			if ( ! root.classList.contains( 'is-open' ) ) {
				return;
			}
			if ( root.contains( event.target ) ) {
				return;
			}
			close( root, trigger, popover );
		} );

		// Escape closes; arrow keys navigate options when popover is open.
		document.addEventListener( 'keydown', function ( event ) {
			if ( ! root.classList.contains( 'is-open' ) ) {
				return;
			}
			if ( event.key === 'Escape' ) {
				event.preventDefault();
				close( root, trigger, popover );
				trigger.focus();
				return;
			}
			if ( event.key === 'ArrowDown' || event.key === 'ArrowUp' ) {
				moveFocus( popover, event.key === 'ArrowDown' ? 1 : -1 );
				event.preventDefault();
				return;
			}
			if ( event.key === 'Tab' ) {
				trapFocus( popover, event );
			}
		} );

		// Wire copy buttons.
		var copyTargets = popover.querySelectorAll( '[data-sdaweb-gcal-ics-copy]' );
		Array.prototype.forEach.call( copyTargets, function ( link ) {
			link.addEventListener( 'click', function ( event ) {
				event.preventDefault();
				var url = link.getAttribute( 'data-sdaweb-gcal-ics-copy' ) || link.href;
				copyToClipboard( url ).then(
					function () {
						markCopied( link, true );
					},
					function () {
						markCopied( link, false );
					}
				);
			} );
		} );

		// Android intent fallback — if the navigator can't handle the intent
		// scheme, jump to the Google web URL after a tick.
		var intentTargets = popover.querySelectorAll( '[data-sdaweb-gcal-ics-fallback]' );
		Array.prototype.forEach.call( intentTargets, function ( link ) {
			link.addEventListener( 'click', function ( event ) {
				var ua = ( navigator.userAgent || '' ).toLowerCase();
				var fallback = link.getAttribute( 'data-sdaweb-gcal-ics-fallback' );
				if ( ! fallback ) {
					return;
				}
				// Non-Android: skip the intent altogether and open the web URL.
				if ( ua.indexOf( 'android' ) === -1 ) {
					event.preventDefault();
					window.open( fallback, '_blank', 'noopener,noreferrer' );
					close( root, trigger, popover );
					return;
				}
				// Android: let the intent attempt fire, but schedule a fallback
				// in case it's swallowed (older Chromiums) — clear it on visibility
				// change (= app launched successfully).
				var fired = false;
				var t = window.setTimeout( function () {
					if ( fired ) {
						return;
					}
					fired = true;
					window.location.href = fallback;
				}, 700 );
				document.addEventListener( 'visibilitychange', function vh() {
					fired = true;
					window.clearTimeout( t );
					document.removeEventListener( 'visibilitychange', vh );
				} );
				close( root, trigger, popover );
			} );
		} );
	}

	function applyViewportClass( root ) {
		if ( window.innerWidth <= SHEET_BREAKPOINT ) {
			root.classList.add( 'is-sheet' );
		} else {
			root.classList.remove( 'is-sheet' );
		}
	}

	function toggle( root, trigger, popover ) {
		if ( root.classList.contains( 'is-open' ) ) {
			close( root, trigger, popover );
		} else {
			open( root, trigger, popover );
		}
	}

	function open( root, trigger, popover ) {
		// Close any other open instance first.
		if ( openInstance && openInstance !== root ) {
			var prevTrigger = openInstance.querySelector( '[data-sdaweb-gcal-ics-trigger]' );
			var prevPop = openInstance.querySelector( '[data-sdaweb-gcal-ics-popover]' );
			close( openInstance, prevTrigger, prevPop );
		}
		popover.hidden = false;
		// Force layout flush so the entry transition runs.
		// eslint-disable-next-line no-unused-expressions
		popover.offsetHeight;
		root.classList.add( 'is-open' );
		trigger.setAttribute( 'aria-expanded', 'true' );
		openInstance = root;

		// Move focus to the first option.
		window.requestAnimationFrame( function () {
			var first = popover.querySelector( '.sdaweb-gcal-ics__option' );
			if ( first ) {
				first.focus();
			}
		} );

		// Lock body scroll on bottom-sheet variant.
		if ( root.classList.contains( 'is-sheet' ) ) {
			document.documentElement.style.overflow = 'hidden';
		}
	}

	function close( root, trigger, popover ) {
		root.classList.remove( 'is-open' );
		trigger.setAttribute( 'aria-expanded', 'false' );
		// Hide after animation completes so the element doesn't trap clicks.
		window.setTimeout( function () {
			if ( ! root.classList.contains( 'is-open' ) ) {
				popover.hidden = true;
			}
		}, 200 );
		if ( openInstance === root ) {
			openInstance = null;
		}
		document.documentElement.style.overflow = '';
	}

	function moveFocus( popover, dir ) {
		var options = popover.querySelectorAll( '.sdaweb-gcal-ics__option' );
		if ( ! options.length ) {
			return;
		}
		var idx = -1;
		for ( var i = 0; i < options.length; i++ ) {
			if ( options[ i ] === document.activeElement ) {
				idx = i;
				break;
			}
		}
		idx = ( idx + dir + options.length ) % options.length;
		options[ idx ].focus();
	}

	function trapFocus( popover, event ) {
		var focusables = popover.querySelectorAll( 'a[href], button, [tabindex]:not([tabindex="-1"])' );
		if ( ! focusables.length ) {
			return;
		}
		var first = focusables[ 0 ];
		var last = focusables[ focusables.length - 1 ];
		if ( event.shiftKey && document.activeElement === first ) {
			event.preventDefault();
			last.focus();
		} else if ( ! event.shiftKey && document.activeElement === last ) {
			event.preventDefault();
			first.focus();
		}
	}

	function copyToClipboard( text ) {
		if ( navigator.clipboard && navigator.clipboard.writeText ) {
			return navigator.clipboard.writeText( text );
		}
		// Legacy fallback: textarea + execCommand.
		return new Promise( function ( resolve, reject ) {
			try {
				var ta = document.createElement( 'textarea' );
				ta.value = text;
				ta.setAttribute( 'readonly', '' );
				ta.style.position = 'absolute';
				ta.style.left = '-9999px';
				document.body.appendChild( ta );
				ta.select();
				var ok = document.execCommand( 'copy' );
				document.body.removeChild( ta );
				if ( ok ) {
					resolve();
				} else {
					reject();
				}
			} catch ( e ) {
				reject( e );
			}
		} );
	}

	function markCopied( link, success ) {
		var stateEl = link.querySelector( '.sdaweb-gcal-ics__option-state' );
		var labelEl = link.querySelector( '.sdaweb-gcal-ics__option-label' );
		if ( ! stateEl ) {
			return;
		}
		var prevLabel = labelEl ? labelEl.textContent : '';
		stateEl.textContent = success ? L10N.copied : L10N.copy_failed;
		link.classList.add( 'is-copied' );
		if ( labelEl && success ) {
			labelEl.textContent = L10N.copied;
		}
		window.setTimeout( function () {
			link.classList.remove( 'is-copied' );
			stateEl.textContent = '';
			if ( labelEl && success ) {
				labelEl.textContent = prevLabel;
			}
		}, 1500 );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}

	// v0.13.2: re-run init() after swap.js replaces inner HTML. The previous
	// [data-sdaweb-gcal-ics] wrapper (and its bound flag) is destroyed by the
	// innerHTML replace, so setup() will bind cleanly to the freshly-rendered
	// trigger / popover / close-button nodes.
	document.addEventListener( 'sdaweb-gcal:viewchanged', init );
}() );
