package com.kafka.visualizer.simulation;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/simulation")
public class SimulationController {
    private final SimulationEngine engine;
    private final PlaybackClock playback;
    public SimulationController(SimulationEngine engine) { this.engine = engine; this.playback=new PlaybackClock(engine); }
    public record ApplyRequest(com.kafka.visualizer.simulation.Configuration configuration, boolean reset, Long configRevision) {}
    @GetMapping("/state") public Map<String, Object> state(@RequestParam(defaultValue = "0") long afterEventId) { return playback.snapshot(afterEventId); }
    @PostMapping("/playback") public Map<String,Object> playback(@RequestBody PlaybackClock.Request request) { return playback.request(request); }
    @GetMapping("/configuration") public com.kafka.visualizer.simulation.Configuration configuration() { return engine.configuration(); }
    @PutMapping("/configuration") public Map<String, Object> apply(@RequestBody ApplyRequest request) {
        engine.apply(request.configuration(), request.reset(), request.configRevision()); return engine.snapshot(0);
    }
    @PostMapping("/commands") public Map<String, Object> command(@RequestBody SimulationEngine.Command command) { engine.command(command); return engine.snapshot(0); }
    @GetMapping("/scenarios") public List<Scenarios.Scenario> scenarios() { return Scenarios.ALL; }
    @PostMapping("/scenarios/{id}") public Map<String, Object> scenario(@PathVariable int id) { engine.scenario(id); return engine.snapshot(0); }
    @GetMapping("/partitions/{topicId}/{partitionId}/history") public Map<String, Object> history(@PathVariable String topicId, @PathVariable int partitionId,
            @RequestParam(required = false) String brokerId, @RequestParam(defaultValue = "0") int page) { return engine.history(topicId, partitionId, brokerId, page); }
    @ExceptionHandler(SimulationException.class) public ResponseEntity<Map<String, Object>> invalid(SimulationException e) {
        return ResponseEntity.status(e.conflict() ? 409 : 400).body(Map.of("message", e.getMessage()));
    }
    @Scheduled(fixedDelay = 1000) public void scheduledTick() { playback.expire(); }
    @Configuration
    @EnableScheduling
    static class EngineConfiguration { @Bean SimulationEngine engine() { return new SimulationEngine(); } }
}
