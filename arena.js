// CourtFlow Midnight Arena: presentation-only public enhancements.
export function initMidnightArena({state, getEvent}) {
  const home = document.getElementById('home');
  const chooser = document.getElementById('ewPublicChooser');
  const publicHeader = document.getElementById('ewPublicHeader');
  if (!home || !chooser || !publicHeader) return {refresh() {}};

  function courtArt() {
    return [
      '<div class="arena-artwork" aria-hidden="true">',
        '<div class="arena-artwork-halo"></div>',
        '<div class="arena-court-diagram">',
          '<span class="arena-court-net"></span>',
          '<span class="arena-court-kitchen arena-kitchen-left"></span>',
          '<span class="arena-court-kitchen arena-kitchen-right"></span>',
        '</div>',
        '<div class="arena-artwork-top"><span class="arena-lamp"></span> ENGINEERED FOR FAIR PLAY</div>',
        '<div class="arena-artwork-bottom"><span>CF<span class="arena-artwork-divider"></span>01</span><small>THE NEXT GAME STARTS HERE</small></div>',
      '</div>'
    ].join('');
  }

  const landing = document.createElement('div');
  landing.id = 'arenaLanding';
  landing.innerHTML = [
    '<div class="arena-landing-copy">',
      '<div class="arena-kicker"><span class="arena-kicker-dot"></span> COURTFLOW <span class="arena-kicker-dash"></span> SMART OPEN PLAY</div>',
      '<h1>Make every<br><em>game count.</em></h1>',
      '<p class="arena-lead">A smarter way to follow live pickleball. Every court, every player, every match - all moving in one seamless flow.</p>',
      '<div class="arena-landing-actions">',
        '<button type="button" id="arenaBrowseEvents" class="arena-primary-action">Explore open plays <span aria-hidden="true">&#8599;</span></button>',
        '<span class="arena-quiet-note"><span class="arena-quiet-line"></span> BUILT FOR THE COMMUNITY</span>',
      '</div>',
      '<div class="arena-feature-strip">',
        '<span><i class="arena-feature-light"></i> Live courts</span>',
        '<span><i class="arena-feature-light"></i> Smart queue</span>',
        '<span><i class="arena-feature-light"></i> Player records</span>',
      '</div>',
    '</div>',
    courtArt()
  ].join('');
  chooser.before(landing);

  const intro = document.createElement('div');
  intro.className = 'arena-event-directory-head';
  intro.innerHTML = '<div><span class="arena-overline">CHOOSE YOUR EXPERIENCE</span><h2>Open play events<span class="arena-gold-stop">.</span></h2></div><p>Choose an event to enter its live court experience.</p>';
  chooser.prepend(intro);

  const eventHero = document.createElement('div');
  eventHero.id = 'arenaEventHero';
  eventHero.innerHTML = [
    '<div class="arena-event-copy">',
      '<div class="arena-kicker arena-live-kicker"><span class="arena-kicker-dot"></span> LIVE EVENT <span class="arena-kicker-dash"></span> COURTFLOW</div>',
      '<h1 id="arenaEventTitle">Open play</h1>',
      '<p class="arena-event-detail"><span id="arenaEventDate">Event date</span><span class="arena-detail-dot"></span><span id="arenaEventVenue">Court venue</span></p>',
      '<div class="arena-event-metrics">',
        '<div><strong id="arenaCountPlaying">0</strong><span>COURTS IN PLAY</span></div>',
        '<div><strong id="arenaCountPlayers">0</strong><span>CHECKED IN</span></div>',
        '<div><strong id="arenaCountCompleted">0</strong><span>FINISHED GAMES</span></div>',
      '</div>',
    '</div>',
    '<div class="arena-event-visual">',courtArt(),'</div>'
  ].join('');
  const breadcrumb = publicHeader.querySelector('.ew-identity');
  if (breadcrumb) breadcrumb.after(eventHero);
  else publicHeader.prepend(eventHero);

  const back = document.getElementById('ewPublicBack');
  if (back) back.textContent = '\u2190 Back to Home';
  landing.querySelector('#arenaBrowseEvents').addEventListener('click', () => {
    chooser.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
  });

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = './arena.css?v=20261102';
  document.head.append(css);

  const put = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
  };
  function refresh() {
    const activeRoute = (location.hash.split('/')[1] || 'home');
    const adminView = activeRoute === 'admin';
    const session = state.sessions.find(s => s.id === getEvent());
    const active = !!session && session.status === 'active';
    document.body.classList.toggle('arena-public', !adminView);
    document.body.classList.toggle('arena-landing', !adminView && !active);
    document.body.classList.toggle('arena-live-view', !adminView && active);
    landing.hidden = adminView || active;

    if (!session) return;
    const attendance = state.attendance.filter(a => a.session_id === session.id && a.checked_in && !a.paused).length;
    const matches = state.matches.filter(m => m.session_id === session.id);
    put('arenaEventTitle', session.title || 'Open play');
    put('arenaEventDate', session.session_date || 'Date to be announced');
    put('arenaEventVenue', session.location || 'Location to be announced');
    put('arenaCountPlaying', matches.filter(m => m.status === 'playing').length);
    put('arenaCountPlayers', attendance);
    put('arenaCountCompleted', matches.filter(m => m.status === 'completed').length);
  }

  return {refresh};
}
