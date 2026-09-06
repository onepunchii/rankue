"""oracle.py — pooltool(Apache-2.0, ekiefl/pooltool 0.6.0)로 같은 샷을 돌리는 오라클.

입력  out/shots.json  (export.ts 가 쓴 것: 공 배치 + pooltool 규약으로 변환된 큐 파라미터)
출력  out/pooltool.json (ours.json 과 같은 모양: afterStrike, events[].after, final, duration)

구성
  테이블   BilliardTableSpecs(l=2.844, w=1.422, cushion_height=0.037) → 포켓 없음, 선형 쿠션 4개
           pooltool 세그먼트 id → 우리 CushionId:  "3"=left(x=0)  "12"=right(x=w)  "18"=bottom(y=0)  "9"=top(y=l)
  공       BallParams(m=0.210, R=0.03075, u_s=0.20, u_r=0.010, e_b=0.93, e_c=0.88, f_c=0.15, g=9.81,
                      u_sp_proportionality = 2·spinDecel/(5g))
           pooltool 의 수직축 스핀 감속은 α = 5·u_sp·g/(2R), u_sp = u_sp_proportionality·R 이므로
           α = 5·u_sp_proportionality·g/2 → u_sp_proportionality = 2α/(5g) = 22/(5·9.81) 로 α = 11 rad/s² 정확히.
  큐       CueSpecs(M=0.52, end_mass = m/endmassRatio = 0.210/12). 스쿼트는 squirt_throttle=0 으로 끄고 φ 에 α 를
           미리 더한 값을 받는다(export.ts 주석). english_throttle=1.
  리졸버   FrictionalInelastic(AlciatoreBallBallFriction a=0.009951 b=0.108 c=1.088) + Han2005Linear/Circular
           + InstantaneousPoint + CanonicalTransition. Stronge(0.6.0 기본 쿠션)는 쓰지 않는다.
           ~/.config/pooltool/physics/resolver.yaml 은 건드리지 않는다(Resolver 를 직접 만들어 PhysicsEngine 에 넣는다).

실행: scripts/sim-oracle/.venv/bin/python scripts/sim-oracle/oracle.py [--in out/shots.json] [--out out/pooltool.json]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import warnings

warnings.filterwarnings("ignore")

import numpy as np  # noqa: E402

import pooltool as pt  # noqa: E402
import pooltool.constants as const  # noqa: E402
from pooltool.objects import Ball, BallParams, BilliardTableSpecs, Cue, CueSpecs, Table  # noqa: E402
from pooltool.physics.engine import PhysicsEngine  # noqa: E402
from pooltool.physics.resolve.ball_ball.friction import AlciatoreBallBallFriction  # noqa: E402
from pooltool.physics.resolve.ball_ball.frictional_inelastic import FrictionalInelastic  # noqa: E402
from pooltool.physics.resolve.ball_cushion.han_2005.model import Han2005Circular, Han2005Linear  # noqa: E402
from pooltool.physics.resolve.ball_pocket import CanonicalBallPocket  # noqa: E402
from pooltool.physics.resolve.resolver import Resolver  # noqa: E402
from pooltool.physics.resolve.stick_ball.instantaneous_point import InstantaneousPoint  # noqa: E402
from pooltool.physics.resolve.transition import CanonicalTransition  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

CUSHION_ID = {"3": "left", "12": "right", "18": "bottom", "9": "top"}
STATE_NAME = {
    const.stationary: "stationary",
    const.spinning: "spinning",
    const.rolling: "rolling",
    const.sliding: "sliding",
}
TRANSITION = {
    "sliding_rolling": ("sliding", "rolling"),
    "rolling_spinning": ("rolling", "spinning"),
    "rolling_stationary": ("rolling", "stationary"),
    "spinning_stationary": ("spinning", "stationary"),
}
MAX_EVENTS = 2000  # shared/sim MAX_EVENTS 와 동일


def build_resolver() -> Resolver:
    return Resolver(
        ball_ball=FrictionalInelastic(friction=AlciatoreBallBallFriction(a=0.009951, b=0.108, c=1.088)),
        ball_linear_cushion=Han2005Linear(),
        ball_circular_cushion=Han2005Circular(),
        ball_pocket=CanonicalBallPocket(),
        stick_ball=InstantaneousPoint(english_throttle=1.0, squirt_throttle=0.0),
        transition=CanonicalTransition(),
        version=9,
    )


def build_ball_params(meta: dict) -> BallParams:
    b = meta["ball"]
    g = b["g"]
    return BallParams(
        m=b["m"],
        R=b["R"],
        u_s=b["muS"],
        u_r=b["muR"],
        u_sp_proportionality=2.0 * b["spinDecel"] / (5.0 * g),
        u_b=0.05,  # Alciatore 마찰 모델에서는 쓰이지 않는다
        e_b=b["eB"],
        e_c=b["eC"],
        f_c=b["fC"],
        g=g,
    )


def state_out(rvw: np.ndarray, s: int) -> dict:
    return {
        "r": [float(x) for x in rvw[0]],
        "v": [float(x) for x in rvw[1]],
        "w": [float(x) for x in rvw[2]],
        "state": STATE_NAME[s],
    }


def snapshot(system: pt.System, k: int) -> dict:
    return {bid: state_out(ball.history[k].rvw, ball.history[k].s) for bid, ball in system.balls.items()}


def run_shot(shot: dict, meta: dict, engine: PhysicsEngine, params: BallParams, table: Table) -> dict:
    balls = {}
    for b in shot["balls"]:
        ball = Ball(id=b["id"], params=params)
        ball.state.rvw[0] = [b["r"][0], b["r"][1], params.R]
        balls[b["id"]] = ball

    cue_meta = meta["cue"]
    specs = CueSpecs(
        brand="rankue-oracle",
        M=cue_meta["M"],
        length=1.42,
        tip_radius=0.0106045,
        shaft_radius_at_tip=0.0065,
        shaft_radius_at_butt=0.02,
        end_mass=params.m / cue_meta["endmassRatio"],
    )
    pc = shot["pooltoolCue"]
    cue = Cue(cue_ball_id=pc["cue_ball_id"], specs=specs)
    system = pt.System(cue=cue, table=table, balls=balls)
    system.cue.set_state(V0=pc["V0"], phi=pc["phi_deg"], theta=pc["theta_deg"], a=pc["a"], b=pc["b"])

    pt.simulate(system, engine=engine, inplace=True, max_events=MAX_EVENTS)

    events = []
    after_strike = None
    truncated = False
    for k, ev in enumerate(system.events):
        et = str(ev.event_type)
        if et == "none":
            continue
        if et == "stick_ball":
            after_strike = snapshot(system, k)
            continue
        after = snapshot(system, k)
        if et == "ball_ball":
            ids = sorted([str(x) for x in ev.ids])
            events.append({"type": "ball-ball", "t": float(ev.time), "ids": ids, "after": after})
        elif et == "ball_linear_cushion":
            bid, seg = ev.ids
            events.append({"type": "ball-cushion", "t": float(ev.time), "ids": [str(bid)], "cushion": CUSHION_ID[str(seg)], "after": after})
        elif et in TRANSITION:
            frm, to = TRANSITION[et]
            events.append({"type": "transition", "t": float(ev.time), "ids": [str(ev.ids[0])], "from": frm, "to": to, "after": after})
        else:
            raise RuntimeError(f"unexpected pooltool event {et} in shot {shot['i']}")
    if len(events) >= MAX_EVENTS:
        truncated = True

    final = {bid: [float(ball.state.rvw[0][0]), float(ball.state.rvw[0][1])] for bid, ball in system.balls.items()}
    return {
        "i": shot["i"],
        "gameType": shot["gameType"],
        "layout": shot["layout"],
        "balls": shot["balls"],
        "input": shot["input"],
        "pooltoolCue": pc,
        "afterStrike": after_strike,
        "events": events,
        "final": final,
        "duration": float(system.t),
        "truncated": truncated,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default=os.path.join(HERE, "out", "shots.json"))
    ap.add_argument("--out", dest="out", default=os.path.join(HERE, "out", "pooltool.json"))
    ap.add_argument(
        "--min-dist",
        dest="min_dist",
        type=float,
        default=None,
        help="진단용: pooltool const.MIN_DIST(make_kiss 스페이서, 기본 1e-6 m) 를 덮어쓴다. "
        "우리 엔진의 DEFAULT_SPACER 는 1e-9 — 두 엔진 차이가 스페이서 때문인지 확인할 때 1e-9 로 준다.",
    )
    args = ap.parse_args()
    if args.min_dist is not None:
        # make_kiss(ball_ball/core.py, ball_cushion/core.py)는 순수 파이썬이고 호출 시점에 const.MIN_DIST 를 읽으므로
        # 모듈 속성을 바꾸면 그대로 반영된다.
        const.MIN_DIST = args.min_dist

    with open(args.inp) as f:
        data = json.load(f)
    meta = data["meta"]
    t = meta["table"]
    table = Table.from_table_specs(BilliardTableSpecs(l=t["length"], w=t["width"], cushion_height=t["cushionHeight"]))
    params = build_ball_params(meta)
    engine = PhysicsEngine(resolver=build_resolver())

    alpha = 5 * params.u_sp * params.g / (2 * params.R)
    assert math.isclose(alpha, meta["ball"]["spinDecel"], rel_tol=1e-12), alpha

    t0 = time.time()
    shots = []
    for shot in data["shots"]:
        shots.append(run_shot(shot, meta, engine, params, table))
    dt = time.time() - t0

    out_meta = dict(meta)
    out_meta["oracle"] = {
        "pooltool": getattr(pt, "__version__", "unknown"),
        "python": sys.version.split()[0],
        "numpy": np.__version__,
        "resolver": "FrictionalInelastic(Alciatore) + Han2005 + InstantaneousPoint(squirt_throttle=0) + CanonicalTransition",
        "ballParams": {k: getattr(params, k) for k in ("m", "R", "u_s", "u_r", "u_sp_proportionality", "u_sp", "e_b", "e_c", "f_c", "g")},
        "cushionIdMap": CUSHION_ID,
        "minDist": const.MIN_DIST,
        "wallSeconds": dt,
    }
    with open(args.out, "w") as f:
        json.dump({"meta": out_meta, "shots": shots}, f, indent=1)
    n_ev = sum(len(s["events"]) for s in shots)
    print(f"pooltool {out_meta['oracle']['pooltool']}: {len(shots)} shots, {n_ev} events, {dt:.1f}s → {args.out}")


if __name__ == "__main__":
    main()
