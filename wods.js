// Workouts of the day: beginner, no-equipment CrossFit-style workouts, rewritten to use only Unbothered's exercises.
// No floor sit-ups or crunches (they hurt the back): those become hanging knee or leg raises. Other swaps:
// Nothing here needs rings, a box, weights or a rope, and there are no handstands.
// burpees -> push-up + squat ("pushsquat"), jumping jacks / jump rope / mountain climbers / vertical jumps -> a short run or
// squats, ring rows / dumbbell rows -> pull-ups, plank -> a hang, pike or handstand push-ups -> feet-up push-ups.
// A move is [exercise, number, what it replaces (shown in the app), push-up variation (1 = feet up)].
//   exercise: an EX key (pullup, pushup, squat, lunge = per leg, kneeraise, legraise), "run" (metres), "hang" (seconds),
//   or "pushsquat" (1 = one push-up + one squat).
// fmt: rft = rounds for time · amrap = as many rounds as possible in `min` · emom = every minute (odd / even lists)
//   tabata = 8 x (20 s work / 10 s rest), the moves take turns · ladder = 1 of each, then 2, ... up to `top`
//   scheme = the reps in `scheme` for each move (21-15-9) · climb = `start` reps in minute 1, +1 each minute until you can't
//   rounds = rounds with `rest` seconds between them, not timed
"use strict";
const WODS = [
  { id: "starter", name: "The Starter", fmt: "rft", rounds: 3, moves: [["squat", 10], ["pushup", 10], ["kneeraise", 10, "sit-ups"]] },
  { id: "baseline", name: "Beginner Baseline", fmt: "rft", rounds: 3, moves: [["squat", 20], ["kneeraise", 15, "sit-ups"], ["pushup", 10]] },
  { id: "minicindy", name: "Mini Cindy", fmt: "amrap", min: 10, moves: [["pushup", 5], ["kneeraise", 10, "sit-ups"], ["squat", 15]] },
  { id: "ladder", name: "The Ladder", fmt: "ladder", top: 10, moves: [["squat"], ["pushup"], ["kneeraise", 0, "sit-ups"]] },
  { id: "tabatacore", name: "Tabata Core", fmt: "tabata", moves: [["kneeraise", 0, "sit-ups"], ["squat"]] },
  { id: "runsquat", name: "Run & Squat", fmt: "rft", rounds: 5, moves: [["run", 200], ["squat", 20]] },
  { id: "climb", name: "Burpee Challenge", fmt: "climb", start: 5, moves: [["pushsquat", 0, "burpees"]] },
  { id: "quick7", name: "The Quick 7", fmt: "rft", rounds: 7, moves: [["squat", 7], ["pushup", 7], ["kneeraise", 7, "sit-ups"]] },
  { id: "corecardio", name: "Core & Cardio", fmt: "rft", rounds: 3, moves: [["run", 200, "30 jumping jacks"], ["kneeraise", 15, "sit-ups"], ["lunge", 10]] },
  { id: "longmile", name: "The Long Mile (scaled)", fmt: "rft", rounds: 4, moves: [["run", 100], ["squat", 10], ["pushup", 10], ["kneeraise", 10, "sit-ups"]] },
  { id: "cindy", name: "Beginner Cindy", fmt: "amrap", min: 10, moves: [["pullup", 5], ["pushup", 10], ["squat", 15]] },
  { id: "firstthree", name: "The First Three", fmt: "rft", rounds: 5, moves: [["squat", 20], ["pushup", 15], ["kneeraise", 10, "sit-ups"]] },
  { id: "emomintro", name: "EMOM Intro", fmt: "emom", min: 12, odd: [["run", 100, "10 jumping jacks"]], even: [["pushsquat", 5, "5 burpees"], ["squat", 5]] },
  { id: "pushpullrun", name: "Push, Pull, Run", fmt: "rft", rounds: 5, moves: [["pushup", 10], ["pullup", 10], ["run", 200]] },
  { id: "bwburner", name: "Bodyweight Burner", fmt: "amrap", min: 20, moves: [["squat", 10], ["pushup", 10], ["lunge", 5], ["squat", 10]] },
  { id: "halfmurph", name: "Half Murph (modified)", fmt: "rft", rounds: 1, note: "Split the middle three however you like.", moves: [["run", 800], ["pushup", 50], ["squat", 100], ["lunge", 75], ["run", 800]] },
  { id: "upper", name: "Upper Body Crusher", fmt: "rft", rounds: 5, moves: [["pullup", 10], ["pushup", 8, 0, 1], ["pushup", 12]] },
  { id: "jumpburn", name: "Jump and Burn", fmt: "amrap", min: 15, moves: [["run", 200], ["squat", 30]] },
  { id: "corecircuit", name: "Core Strength Circuit", fmt: "rounds", rounds: 4, rest: 60, moves: [["hang", 30, "30 s plank"], ["run", 100, "20 mountain climbers"], ["legraise", 10, "15 sit-ups"]] },
  { id: "burpee8", name: "Simple Burpee Workout", fmt: "amrap", min: 8, moves: [["pushsquat", 1, "burpees"]] },
  { id: "bwcf", name: "Bodyweight CrossFit WOD", fmt: "rft", rounds: 3, moves: [["squat", 10], ["kneeraise", 10, "sit-ups"], ["pushup", 10], ["pullup", 10], ["pushsquat", 10, "burpees"]] },
  { id: "sandwich", name: "The Running Sandwich", fmt: "rft", rounds: 1, moves: [["run", 400], ["squat", 40], ["kneeraise", 30, "sit-ups"], ["pushsquat", 20, "burpees"], ["pullup", 10], ["run", 400]] },
  { id: "jumpslunges", name: "Jumps and Lunges", fmt: "rft", rounds: 5, moves: [["lunge", 15], ["run", 200]] },
  { id: "tabatapl", name: "Tabata Push-ups & Lunges", fmt: "tabata", moves: [["pushup"], ["lunge"]] },
  { id: "fives", name: "Push-ups & Burpees in 5s", fmt: "rft", rounds: 5, moves: [["pushup", 5], ["pushsquat", 5, "burpees"], ["run", 100]] },
  { id: "squatpullrun", name: "Squats, Pull-ups & Running", fmt: "rft", rounds: 3, moves: [["squat", 12], ["pullup", 10], ["pushup", 8, 0, 1], ["run", 400]] },
  { id: "squatroutine", name: "Beginner Squat Routine", fmt: "rft", rounds: 3, moves: [["pushsquat", 10, "burpees"], ["kneeraise", 15, "sit-ups"], ["squat", 20]] },
  { id: "thrusterburner", name: "Squat & Burpee Burner", fmt: "scheme", scheme: [21, 15, 9], moves: [["squat", 0], ["pushsquat", 0, "burpees"]] },
];
if (typeof module !== "undefined") module.exports = WODS;
