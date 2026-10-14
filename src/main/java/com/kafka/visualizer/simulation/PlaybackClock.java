package com.kafka.visualizer.simulation;

import java.util.Map;
import java.util.function.LongSupplier;

/** Wall time governs browser ownership only. Engine progress remains deterministic. */
public final class PlaybackClock {
    private final SimulationEngine engine;
    private final LongSupplier millis;
    private String owner = "";
    private long expires;
    public PlaybackClock(SimulationEngine engine) { this(engine, System::currentTimeMillis); }
    PlaybackClock(SimulationEngine engine, LongSupplier millis) { this.engine=engine; this.millis=millis; }
    public record Request(String action, String clientId, long epoch, long expectedTick, long completedEventId) {}
    public synchronized Map<String,Object> request(Request r) {
        expire();
        if (r==null || r.clientId()==null || !r.clientId().matches("[A-Za-z0-9_-]{1,80}")) throw new SimulationException("Playback client ID is required");
        if (!java.util.Set.of("CLAIM","HEARTBEAT","ADVANCE").contains(r.action()==null?"":r.action())) throw new SimulationException("Unknown playback action");
        if (!owner.isEmpty() && !owner.equals(r.clientId())) {
            if(!r.action().equals("ADVANCE")) return snapshot(r.completedEventId());
            throw new SimulationException("Another browser controls playback",true);
        }
        owner=r.clientId(); expires=millis.getAsLong()+10000;
        if (r.action().equals("ADVANCE")) engine.pacedAdvance(r.epoch(),r.expectedTick(),r.completedEventId());
        return snapshot(r.completedEventId());
    }
    public synchronized Map<String,Object> snapshot(long after) {
        expire();
        var result=new java.util.LinkedHashMap<>(engine.snapshot(after));
        result.put("playbackOwner",owner); return java.util.Collections.unmodifiableMap(result);
    }
    public synchronized void expire() {
        if (!owner.isEmpty() && millis.getAsLong()>=expires) {
            owner=""; engine.command(new SimulationEngine.Command("PAUSE",null,null,null,null));
        }
    }
}
