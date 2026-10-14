package com.kafka.visualizer.simulation;

public class SimulationException extends RuntimeException {
    private final boolean conflict;
    public SimulationException(String message) { this(message, false); }
    public SimulationException(String message, boolean conflict) { super(message); this.conflict = conflict; }
    public boolean conflict() { return conflict; }
}
