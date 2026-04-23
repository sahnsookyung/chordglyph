# Gesture Instrument v1 Specification

## 1. Purpose

Build a browser-based musical instrument controlled by hand gestures captured from a camera.

The instrument shall:
- let the user select **13 base notes** on screen with one hand
- let the user select **chord modes** with the other hand
- produce low-latency audio suitable for practice, experimentation, and demo use
- prioritize **ergonomic, easy-to-learn, visually separable gestures** over a large gesture vocabulary
- use only **free/open-source tools** or tools that are **free for open-source use**

v1 is intended to prove that the interaction model is viable, pleasant to use, and implementable without paid infrastructure or paid proprietary runtimes.

---

## 2. Product Boundary

### In scope
- Real-time hand tracking from a standard RGB webcam
- On-screen 13-note note strip
- Bimanual interaction: one hand for note selection, one hand for chord modification
- Four musical output modes:
  - single note
  - major chord
  - minor chord
  - dominant seventh chord
- Low-latency synthesis in browser
- Visual feedback for note, mode, tracking confidence, and errors
- Basic calibration and handedness selection
- Logging for gesture performance and misclassification review
- Local-only inference and local-only audio generation

### Out of scope for v1
- Full polyphonic free voicing
- Complex jazz chord vocabulary
- One-hand-only advanced mode
- Full mobile optimization
- Haptics
- MIDI hardware support
- Depth camera dependency
- Multiplayer / network sync
- DAW plugin packaging
- Gesture personalization via online training
- Paid cloud APIs
- Proprietary tracking hardware as a requirement

---

## 3. Core Design Decision

v1 shall use **bimanual interaction**.

- **Dominant hand**: selects the root/base note using the index fingertip over a 13-note on-screen strip.
- **Non-dominant hand**: selects the harmonic mode using one of four relaxed hand postures.

### Why this design
- It separates continuous spatial control from discrete mode selection.
- It reduces overload on a single hand.
- It is more robust for computer vision than asking one hand to both point precisely and simultaneously form complex finger poses.
- It allows the chord-hand gestures to stay small and comfortable.

---

## 4. User Experience Summary

### User flow
1. User opens the app.
2. Camera permission is granted.
3. App detects both hands and identifies left/right.
4. User optionally sets dominant hand in settings.
5. Dominant-hand index fingertip controls the note cursor.
6. Non-dominant-hand gesture controls chord mode.
7. When the note cursor enters a note zone and remains stable, audio is triggered.
8. Chord mode changes update the currently sounding harmony.
9. Visual overlays show tracking quality, selected note, selected mode, and whether audio is armed.

### UX principles
- Keep gestures few and memorable.
- Do not require extreme finger extension or awkward pinches.
- Avoid accidental retriggering while hovering near note boundaries.
- Make the current system state obvious at all times.
- Always fail gracefully to a safe state.

---

## 5. Gesture Grammar

## 5.1 Dominant hand: note-selection hand

### Input primitive
- Use the **index fingertip** landmark.
- Use the x-position of the fingertip projected into the note strip coordinate system.

### Note-selection rule
- The note strip contains **13 equal or near-equal zones**.
- The selected root note is the zone containing the smoothed index fingertip position.

### Note list
The 13 base notes for v1 shall be:
- C
- C# / Db
- D
- D# / Eb
- E
- F
- F# / Gb
- G
- G# / Ab
- A
- A# / Bb
- B
- C (octave)

### Triggering rule
The system should support two selectable modes:

#### Mode A: hover-to-play (default)
- A note is triggered when the fingertip enters a zone and remains stable for a minimum dwell time.
- Retigger only when:
  - the finger leaves the zone and re-enters, or
  - the retrigger cooldown expires and movement exceeds threshold.

#### Mode B: pinch-to-play (experimental toggle)
- The dominant hand still selects the note by position.
- Audio triggers only when a small dominant-hand thumb-index pinch is detected.
- This mode is not the default because it adds extra motor load.

### Recommended default thresholds
- landmark smoothing window: 3 to 5 frames equivalent
- dwell before trigger: 50 to 90 ms
- zone switch hysteresis: 8 to 12% of zone width
- retrigger cooldown: 70 to 120 ms

---

## 5.2 Non-dominant hand: chord-mode hand

v1 shall expose **4 chord modes only**.

### Mode mapping
1. **Open hand** → single note
2. **Thumb-index pinch** → major
3. **Thumb-middle pinch** → minor
4. **Loose fist** → dominant seventh

### Gesture definitions

#### Open hand
- all four fingers mostly extended
- thumb naturally abducted or relaxed
- low pinch confidence
- low curl average

#### Thumb-index pinch
- thumb tip to index tip distance below pinch threshold
- middle/ring/pinky unconstrained except not closed into full fist

#### Thumb-middle pinch
- thumb tip to middle tip distance below pinch threshold
- index not simultaneously pinched stronger than middle

#### Loose fist
- average curl over index/middle/ring/pinky above fist threshold
- fingertip-to-palm distances reduced
- thumb position relaxed; no need for tight clench

### Stability rule
Chord mode changes shall require:
- minimum confidence threshold
- minimum persistence time of 60 to 100 ms
- hysteresis so the system does not flicker between adjacent interpretations

### Priority order when ambiguous
1. fist
2. thumb-index pinch
3. thumb-middle pinch
4. open hand

This ordering is chosen so that a clearly closed hand does not get misread as a noisy pinch.

### Known confusion risks
The system shall explicitly track the following likely confusion pairs:
- open hand vs weak / partial open hand
- thumb-index pinch vs thumb-middle pinch under self-occlusion
- loose fist vs partially curled relaxed hand

### Required fallback behavior for ambiguity
- if no gesture wins by the required confidence margin, keep the previous stable mode for a short hold period
- if ambiguity persists past timeout, revert to **single note**
- do not emit rapid chord toggles during ambiguous frames

### Confidence-margin requirement
For any chord classification to replace the current stable mode:
- the winning gesture score must exceed the minimum confidence threshold, and
- the winning gesture must exceed the runner-up by a configurable margin

This exists to prevent mode flicker under webcam noise.

---

## 6. Interaction Layout

## 6.1 Note strip geometry

The 13 notes shall be rendered as a **shallow horizontal arc** across the lower-middle region of the screen.

### Geometry requirements
- centered horizontally
- occupies 55 to 75% of viewport width
- occupies 12 to 18% of viewport height
- default y-position near lower-middle, not at bottom edge
- each note zone visually separated
- currently selected zone enlarged and highlighted

### Adaptive sizing
- zone width should increase slightly when tracking confidence is low
- optionally allow “compact” and “large” layouts in settings

### Targetability requirement
The 13-zone layout is a hypothesis, not an assumption.

It shall be treated as valid only if testing shows users can hit requested zones with sufficient accuracy and speed.

### Minimum layout test requirements
The layout must be evaluated for:
- note-zone hit accuracy
- neighboring-zone accidental trigger rate
- average time to acquire a requested note
- boundary jitter frequency

### Fallback layout if 13 zones fail
If testing shows 13 zones are too dense for reliable webcam use, v1 must support one of these fallback modes:
- **reduced note mode**: 8 visible notes
- **paged mode**: 7 visible notes plus a shift gesture or octave/page control
- **snap-assist mode**: stronger attraction toward zone centers and stronger hysteresis

The project should not force 13 zones at all costs if the interaction proves too error-prone.

## 6.2 Chord-mode display
- show the current chord mode as a persistent label near the top or upper side
- show a mini legend with the 4 non-dominant gestures
- optionally display an icon for each mode

## 6.3 Visual tracking overlays
- skeleton landmarks for both hands
- fingertip cursor trace for dominant index
- confidence bars per hand
- warning state when one hand is lost

---

## 7. Audio Specification

## 7.1 Audio engine
v1 shall use browser audio with low-latency processing.

### Required capabilities
- polyphonic synth voice allocation
- envelope control
- chord note scheduling
- immediate note-off/note-change on root transition
- optional sustain parameter

## 7.2 Instrument sound
Default patch for v1:
- soft synth or electric piano style
- short attack
- moderate decay
- low release tail

## 7.3 Chord generation
Given root note `R`:
- single note: `R`
- major: `R, R+4, R+7`
- minor: `R, R+3, R+7`
- dominant seventh: `R, R+4, R+7, R+10`

### Voicing rule for v1
- fixed close voicing in one octave
- optional inversion support is out of scope
- default root register shall be chosen so output is not excessively high or excessively muddy on laptop speakers

### Transition policy
The instrument must define how it sounds when the user changes note or chord rapidly.

Required behaviors:
- previous voices must be released cleanly
- abrupt repeated retriggers should not create clicks or hanging notes
- voice stealing must prefer the oldest active voices
- mode changes while holding the same root should update harmony predictably rather than produce stacked duplicates

### Perceived quality requirement
Even if tracking works, the instrument will fail the user if chord transitions sound crude.

Therefore the audio engine must be reviewed not only for technical correctness but for:
- transition smoothness
- absence of hanging notes
- intelligibility of chord identity
- acceptable sound on laptop speakers and headphones

## 7.4 Trigger behavior
When note or mode changes:
- if legato mode is enabled, transition smoothly to new chord
- if legato mode is disabled, release previous voices then trigger new voices

Default: legato disabled for simpler perception and debugging.

---

## 8. System Architecture

## 8.1 High-level pipeline
1. Camera capture
2. Frame preprocessing
3. Hand detection + landmarks
4. Hand assignment (dominant vs non-dominant)
5. Feature extraction
6. Gesture classification / state estimation
7. Note-zone mapping
8. Temporal smoothing + hysteresis
9. Interaction state machine
10. Audio event generation
11. Rendering and logging

## 8.2 Platform choice
v1 primary target:
- desktop browser on laptop/desktop
- Chromium-class browser preferred during development

## 8.3 Implementation stack
### Frontend
- TypeScript
- Canvas 2D UI or React-based UI
- requestAnimationFrame render loop

### Vision
- MediaPipe Hand Landmarker in web runtime
- rule-based gesture recognition from landmarks
- optional custom lightweight classifier later only if needed

### Audio
- Web Audio API
- AudioWorklet for timing-critical or custom DSP work
- Tone.js optionally for synths and scheduling convenience

### State and logging
- lightweight local state store
- JSON event logs for sessions

## 8.4 Dependency policy
All required technologies for v1 must be:
- open-source, or
- free to use for open-source projects

The preferred dependency profile for v1 is:
- Apache 2.0
- MIT
- BSD-style licenses
- royalty-free web standards

The spec should avoid any dependency that requires:
- paid runtime licensing for normal open-source distribution
- paid cloud inference to function
- paid hardware to reach baseline usability

Therefore v1 shall be designed around:
- a standard RGB webcam
- browser-native web technologies
- on-device inference only

---

## 9. Computer Vision Specification

## 9.1 Detection/tracking input
- RGB webcam input
- target camera resolution: 720p default
- fallback: 480p if performance is poor

## 9.2 Hand tracking outputs required
Per detected hand:
- 21 landmarks
- handedness label
- landmark confidence / presence confidence if available
- world coordinates if available

## 9.3 Hand assignment
The system shall not rely solely on model left/right handedness.

Use a robust hand-role assignment policy:
- ask user to specify dominant hand in settings
- assign the hand matching the chosen side as note hand
- assign the opposite hand as chord hand
- if only one hand is visible, preserve last valid assignment when possible

## 9.4 Derived features
For each frame, compute:
- fingertip positions
- fingertip-to-thumb distances
- fingertip-to-palm distances
- per-finger curl estimates
- palm center
- palm normal or approximate hand orientation
- finger extension flags
- hand bounding box size
- motion velocity of dominant index fingertip

## 9.5 Smoothing
Use a two-layer smoothing strategy:

### Layer 1: geometric smoothing
- exponential moving average or one euro filter for fingertip positions
- separate smoothing factors for position and velocity

### Layer 2: symbolic smoothing
- gesture persistence windows
- note-zone hysteresis
- confidence-gated updates

## 9.6 Explicit operating envelope
The RGB-webcam v1 shall explicitly declare the conditions where performance is expected to degrade.

Known weak conditions:
- low light
- strong backlighting
- motion blur from fast movement
- cluttered or hand-colored backgrounds
- one hand occluding the other
- hands too close to camera or too far from camera
- poor camera quality or low frame rate

The product should be honest about this boundary rather than implying universal robustness.

## 9.7 Minimum supported environment
For v1 to be considered supported, the user environment should roughly satisfy:
- stable indoor lighting
- both hands visible with limited overlap
- camera operating near 30 FPS or better
- user seated or standing at a moderate fixed distance from camera

Anything outside this envelope is best treated as degraded or unsupported in v1.

---

## 10. Gesture Classification Logic

## 10.1 v1 classifier strategy
v1 should use **rule-based gesture classification from landmarks**, not end-to-end image classification.

### Why
- simpler debugging
- better interpretability
- lower data requirement
- easier tuning of thresholds per gesture

## 10.2 Rule examples

### Pinch score
For each pinch candidate:
- normalized distance = distance(thumb_tip, target_tip) / hand_scale
- pinch if normalized distance < threshold

### Fist score
- average curl(index, middle, ring, pinky)
- fist if average curl > threshold and fingertip-to-palm distances are low

### Open-hand score
- count of extended fingers >= 4
- pinch scores low

## 10.3 Ambiguity handling
When no gesture passes threshold with sufficient margin:
- keep previous stable chord mode for grace period
- mark the mode state as “held”
- if ambiguity persists beyond timeout, revert to single note

Recommended timeout: 250 to 400 ms

## 10.4 Exit criteria for rule-based classification
Rule-based classification is the correct default for v1, but it must not become a permanent dogma.

A lightweight learned classifier on top of landmarks becomes justified if, after threshold tuning and optional calibration:
- gesture confusion remains above target thresholds,
- cross-user variability remains too high,
- per-camera retuning is frequently required, or
- ambiguity time is high enough to make interaction feel sluggish.

Suggested decision boundary:
- if any two chord gestures remain below **95% pairwise classification accuracy** in controlled test conditions across the evaluation set, or
- if overall chord-mode precision or recall remains below **95%** after threshold tuning,
then the project should consider a learned landmark-based classifier for chord mode.

The upgrade path should still remain landmark-based, not raw-image end-to-end intent classification, unless a later research phase specifically justifies it.

---

## 11. Interaction State Machine

## 11.1 System states
- `BOOT`
- `CAMERA_READY`
- `TRACKING_SEARCH`
- `TRACKING_ACTIVE`
- `PLAYING`
- `DEGRADED_TRACKING`
- `PAUSED`

## 11.2 Hand sub-states
For each hand:
- `NOT_FOUND`
- `UNSTABLE`
- `STABLE`
- `LOST_RECENTLY`

## 11.3 Musical state
- current root
- current chord mode
- last triggered voicing
- note-on timestamp
- retrigger cooldown active or not

## 11.4 Failure transitions
Examples:
- if note hand confidence drops below threshold for more than 150 ms, release sustained audio or fade out depending on setting
- if chord hand disappears, preserve previous chord mode for a short grace period then revert to single note
- if both hands disappear, enter degraded state and silence after grace timeout

---

## 12. Performance Targets

## 12.1 Latency targets
Target end-to-end latency from physical movement to audible onset:
- aspirational: <= 80 ms
- acceptable v1: <= 120 ms

Breakdown target:
- camera/frame acquisition: 16 to 33 ms
- landmark inference + processing: 10 to 25 ms
- gesture stabilization: 20 to 40 ms
- audio scheduling/output: 5 to 20 ms

### Important distinction: pipeline latency vs perceived musical latency
The system must separately track:
- **pipeline latency**: measurable time from motion to audio event emission
- **perceived musical latency**: the delay users feel while trying to play rhythmically

The second metric is more important for the instrument experience.

Dwell thresholds, smoothing, and browser jitter can make a system feel slower than the raw benchmark suggests.

### Latency review rule
A build does not pass review merely because pipeline latency is under target.
It must also feel responsive enough for basic rhythmic play in user testing.

## 12.2 Frame rate targets
- target visual processing: 30 FPS minimum
- ideal: 60 FPS on capable hardware

## 12.3 Device targets
Supported for v1:
- recent laptop with webcam
- desktop with USB webcam

Not guaranteed for v1:
- low-end phones
- tablets with weak browsers

---

## 13. Calibration and Settings

## 13.1 Required settings
- dominant hand: left / right
- camera selection
- note strip size: compact / normal / large
- audio volume
- synth patch
- hover-to-play vs pinch-to-play
- debug overlays: on / off
- note labels: sharps / flats

## 13.2 Optional calibration flow
At first launch, the app may run a short calibration:
1. show both hands
2. point with dominant index across the strip
3. make each chord gesture once
4. store normalized ranges for pinch distance and finger curl

v1 may ship with default thresholds and treat this calibration as optional if implementation time is tight.

---

## 14. Error Handling and Degraded Behavior

## 14.1 Common failure modes
- one hand occludes the other
- fingertip jitters near note boundaries
- pinch distances vary across users and camera distances
- hand leaves frame
- lighting is poor
- background is cluttered

## 14.2 Required mitigations
- smoothing and hysteresis
- grace periods before dropping state
- large enough note zones
- confidence gating for chord changes
- explicit UI feedback when tracking quality is poor
- safe fallback to single note when chord hand becomes ambiguous

## 14.3 User-facing messages
The UI shall surface short messages such as:
- “Move hands slightly farther apart”
- “Chord hand lost — holding previous mode”
- “Tracking weak — reverting to single note”
- “Low light detected”

---

## 15. Logging and Evaluation

## 15.1 Evaluation model
Validation for this project shall be split into two stages:

### Stage 1: Engineering validation
This happens during implementation and before broader user exposure.

Its purpose is to determine:
- whether the system functions correctly
- whether the CV and state machine are stable enough
- whether latency and false-trigger behavior are acceptable in controlled conditions
- whether the build is mature enough to justify human validation

### Stage 2: Human validation
This happens only after the build passes Stage 1.

Its purpose is to determine:
- whether the interaction is learnable
- whether the gestures are comfortable
- whether the instrument feels responsive and musically usable
- whether real users can control it reliably in practice

The project must not confuse Stage 1 success with proof of product viability.

## 15.2 Session logging
The app should log:
- timestamped note selections
- chord mode changes
- gesture confidence values
- note-zone transitions
- dropped tracking events
- frame-rate estimate
- audio trigger timestamps

## 15.3 Purpose of logs
Logs are needed to:
- measure latency
- inspect false positives and false negatives
- tune thresholds
- compare layout and gesture variants
- support engineering acceptance decisions before user testing

## 15.4 Privacy boundary
v1 should not store raw camera video by default.

If video capture is added for debugging, it must be:
- opt-in
- clearly disclosed
- saved locally only unless the user explicitly exports it

---

## 16. Data Collection Plan

## 16.1 Why data is still needed
Even with a rule-based v1, you still need evaluation data to tune thresholds and understand failure cases.

## 16.2 Minimum dataset for v1
Collect short clips or landmark logs from multiple users for:
- open hand
- thumb-index pinch
- thumb-middle pinch
- loose fist
- note-selection sweeps across all 13 zones
- repeated target-acquisition tasks across the note strip
- degraded-condition trials such as lower light and mild background clutter

## 16.3 Diversity requirements
Include variation in:
- hand size
- skin tone
- lighting conditions
- camera angle
- distance from camera
- left-handed and right-handed play

## 16.4 Required evaluation metrics
The project shall not rely on subjective impressions alone.

At minimum record:
- chord-gesture precision
- chord-gesture recall
- gesture confusion matrix
- note-zone hit accuracy
- neighboring-zone accidental trigger rate
- median time to acquire a requested note
- false trigger count per minute
- tracking dropout rate
- median and p95 pipeline latency
- subjective fatigue rating after short sessions
- subjective responsiveness rating

## 16.5 Ground truth format
For each captured segment, record:
- intended gesture
- start/end time
- whether the hand was dominant or non-dominant
- subjective comfort rating
- notes on confusion or fatigue
For each captured segment, record:
- intended gesture
- start/end time
- whether the hand was dominant or non-dominant
- subjective comfort rating
- notes on confusion or fatigue

---

## 17. Validation Strategy

## 17.1 Stage 1: Engineering validation
This stage exists to decide whether the build is technically sound enough to expose to real users.

### What is allowed in Stage 1
- component tests
- prerecorded clips
- landmark log replay
- developer bench testing
- controlled internal trials on known hardware
- stress testing for edge cases

### What Stage 1 must answer
- does hand tracking stay stable enough in supported conditions
- does note-zone mapping work under controlled input
- does chord classification work under controlled input
- does the state machine avoid obvious broken behavior
- is latency low enough to justify user testing
- is false-trigger behavior low enough to avoid wasting user-testing effort

## 17.2 Stage 1 component validation
Before the full product is considered test-ready, validate subsystems separately.

### Prototype testing policy
For the current prototype phase, **unit tests are the required baseline**.

This means the project should prioritize deterministic tests for the parts it directly controls, rather than trying to build a full CV validation framework too early.

In particular, the prototype should focus on unit testing:
- fingertip smoothing behavior
- pinch-score computation
- finger curl estimation from landmark inputs
- note-zone mapping
- hysteresis and debounce rules
- dominant-vs-non-dominant hand assignment logic
- ambiguity hold behavior
- fallback to single note
- cooldown handling
- chord generation and audio event planning
- state-machine transitions

### What is not required yet
The following are valuable, but should be treated as **stretch goals** during the prototype phase rather than blocking requirements:
- large fixture-based CV regression suites
- metamorphic/property-style CV tests
- broad robustness evaluation across many lighting/background conditions
- extensive prerecorded clip corpora for CI

These ideas should remain in the spec as future engineering improvements, but they are not required for the first prototype milestone.

### CV subsystem
For the prototype, CV validation should remain lightweight.

Preferred approach:
- rely on live bench testing for raw webcam landmark detection
- add unit tests around post-landmark logic
- optionally save a small number of landmark traces or short clips for debugging, but do not make this a hard requirement for the prototype

### Note mapping subsystem
Validate using synthetic or recorded fingertip trajectories:
- zone assignment correctness
- boundary hysteresis behavior
- snap behavior if enabled
- accidental neighboring-zone switching

### Audio subsystem
Validate with deterministic event sequences:
- correct note/chord output
- no hanging notes
- correct retrigger behavior
- acceptable transition behavior

### State machine subsystem
Validate with scripted event traces:
- hand loss and reacquisition
- ambiguity hold behavior
- fallback to single note
- cooldown handling
- rapid note and mode changes

## 17.3 Stage 1 engineering gates
The build should not proceed to broader human testing unless the following gates are met on the target development setup.

### Gate A: Controlled chord classification
Using an internal recorded evaluation set under supported conditions:
- chord-mode precision >= **97%**
- chord-mode recall >= **97%**
- no severe confusion pattern that causes unstable live use

### Gate B: Controlled note mapping
Using controlled internal trials or replayed trajectories:
- note-zone assignment accuracy >= **95%** in the default layout under supported conditions, or
- fallback layout is adopted before further testing

### Gate C: Pipeline behavior
- median pipeline latency <= **100 ms** on the target machine
- p95 pipeline latency <= **140 ms**
- no critical audio/state bugs in a **30-minute** internal session

### Gate D: False-trigger behavior
In controlled internal hold and idle tests:
- unintended chord toggles below the predefined internal ceiling
- unintended note-zone changes below the predefined internal ceiling
- no repeated oscillation at zone boundaries after hysteresis tuning

### Gate E: Operating-envelope honesty
The build must clearly identify which conditions are supported and which are degraded.
A build that only works in unusually favorable conditions must not be promoted to user validation without that boundary being explicit.

## 17.4 Stage 1 reporting
Every engineering-validation pass should produce a short report containing:
- hardware and browser used
- lighting condition class
- what was tested live vs what was covered by unit tests
- metrics recorded
- pass/fail result per gate
- known blocking issues

### Prototype note
During the prototype phase, it is acceptable for Stage 1 reporting to rely mainly on:
- unit-test results
- developer bench testing notes
- a small number of manually reproduced scenarios

A heavier reporting and dataset pipeline can be added later if the prototype proves worth extending.

## 17.5 Stage 2: Human validation
This stage begins only after Stage 1 passes.

### Purpose
To determine whether the system is actually learnable, comfortable, and musically usable for humans rather than merely technically functional.

### Typical Stage 2 questions
- can first-time users understand the model quickly
- can they reliably hit notes and switch chord modes
- does it feel responsive enough to play
- do they fatigue quickly
- do they find the interaction frustrating or natural

## 17.6 Stage 2 metrics
At minimum track:
- first-time task success rate
- time to learn the interaction basics
- note acquisition accuracy during guided tasks
- chord-mode accuracy during guided tasks
- perceived responsiveness rating
- fatigue rating after timed use
- qualitative feedback on confusion and comfort

## 17.7 Stage 2 pass/fail use
Stage 2 is where the project decides whether the interaction design is worth refining further or whether the core concept should be simplified or changed.

A technically functional build may still fail Stage 2.

---

## 18. Acceptance Criteria

Acceptance must also be staged.

## 18.1 Stage 1 acceptance
The build is allowed to enter human testing only if it passes the Stage 1 engineering gates.

## 18.2 Stage 2 acceptance
v1 is considered genuinely validated only if it also performs adequately in human validation on the target setup.

### Functional
- users can correctly acquire requested note zones with at least **90% accuracy** in the default 13-zone layout, or the product must fall back to a simpler layout
- users can switch among the 4 chord modes with at least **95% precision** and **95% recall** under supported conditions
- sound updates in real time without hanging notes or broken state transitions

### Performance
- median end-to-end pipeline latency is **<= 120 ms**
- p95 pipeline latency is **<= 160 ms**
- tracking remains usable at **30 FPS or better** on a normal target laptop

### Usability
- at least **80%** of first-time users can understand the interaction model within **5 minutes**
- users can complete a simple guided task sequence with at least **85% success**
- average fatigue rating after a **10-minute** session must remain within the predefined acceptable band used in testing

### Reliability
- brief hand loss under **250 ms** does not immediately collapse interaction state
- ambiguous chord input falls back safely rather than producing erratic repeated toggles
- neighboring-note accidental trigger rate remains below the predefined threshold adopted during evaluation, and if it does not, the layout must be simplified

### Review rule
If Stage 1 fails, the build is not ready for user validation.
If Stage 2 fails, the build may still be a useful prototype, but it should not be described as a validated v1 interaction design.

---

## 19. Risk Register

### Risk 1: 13-zone layout is too dense
- **Likelihood**: high
- **Impact**: high
- **Mitigation**: evaluate early; add reduced note mode or paged mode

### Risk 2: chord gesture confusion is too high
- **Likelihood**: medium
- **Impact**: high
- **Mitigation**: confidence margins, calibration, fallback to single note, learned landmark classifier if required

### Risk 3: perceived latency feels too slow
- **Likelihood**: medium
- **Impact**: high
- **Mitigation**: minimize dwell, reduce smoothing where possible, measure perceived responsiveness not only raw timing

### Risk 4: webcam conditions are too fragile
- **Likelihood**: high
- **Impact**: medium to high
- **Mitigation**: explicit operating envelope, strong user feedback, degraded-mode behavior, honest support boundary

### Risk 5: arm fatigue limits session length
- **Likelihood**: medium
- **Impact**: medium
- **Mitigation**: posture guidance, shallow horizontal layout, short-session positioning of the product

---

## 20. Development Plan

## 20. Development Plan

## Phase 1: Skeleton prototype
- webcam feed
- hand landmarks on screen
- note strip rendering
- index-fingertip note selection
- debug overlays

## Phase 2: Musical interaction
- chord gesture detection
- state machine
- synth output
- note trigger/retrigger rules

## Phase 3: Stability and UX
- smoothing and hysteresis
- grace periods
- visual feedback polish
- settings panel

## Phase 4: Evaluation
- log review
- threshold tuning
- basic usability testing
- latency measurement

---

## 21. Stretch Goals After v1

Only after v1 is stable, consider:
- more chord types
- arpeggiator mode
- scale locking
- MIDI output
- local model personalization
- depth-camera mode
- XR or spatial version via OpenXR-compatible paths
- fixture-based CV regression suites
- metamorphic/property-style tests for CV-adjacent behavior
- larger prerecorded landmark and clip corpora for regression testing

---

## 22. Final Recommendation

The best v1 is a **browser-first, landmark-based, bimanual musical instrument** using:
- dominant-hand index pointing for 13 root notes
- non-dominant-hand relaxed gestures for 4 chord modes
- local webcam inference
- free/open-source tooling only

The design priority is not maximum expressive complexity. The design priority is **robustness, ergonomics, learnability, and low engineering risk**.

That is the correct v1 boundary.

