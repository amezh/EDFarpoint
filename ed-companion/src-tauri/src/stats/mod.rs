use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Trip stats — resets on dock
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TripStats {
    pub systems_visited: u32,
    pub bodies_scanned: u32,
    pub bodies_mapped: u32,
    pub first_discoveries: u32,
    pub carto_value: u64,
    pub bio_value: u64,
    pub bio_species_found: u32,
    pub bio_species_analysed: u32,
    pub distance_travelled: f64,
    #[serde(skip)]
    pub visited_systems: HashSet<String>,
}

impl TripStats {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn reset(&mut self) {
        *self = Self::default();
    }

    pub fn add_system(&mut self, name: &str, jump_dist: f64) {
        if self.visited_systems.insert(name.to_string()) {
            self.systems_visited = self.visited_systems.len() as u32;
        }
        self.distance_travelled += jump_dist;
    }

    pub fn add_body_scan(&mut self, is_first: bool) {
        self.bodies_scanned += 1;
        if is_first {
            self.first_discoveries += 1;
        }
    }

    pub fn add_body_mapped(&mut self) {
        self.bodies_mapped += 1;
    }

    pub fn add_carto_value(&mut self, value: u64) {
        self.carto_value += value;
    }

    pub fn add_bio_scan(&mut self) {
        self.bio_species_found += 1;
    }

    pub fn add_bio_analysis(&mut self, value: u64) {
        self.bio_species_analysed += 1;
        self.bio_value += value;
    }

    pub fn total_value(&self) -> u64 {
        self.carto_value + self.bio_value
    }
}

/// Lifetime stats — persisted, never resets
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LifetimeStats {
    pub total_carto_earned: u64,
    pub total_bio_earned: u64,
    pub total_systems: u64,
    pub total_bodies_scanned: u64,
    pub total_bodies_mapped: u64,
    pub total_bio_species: u64,
    pub total_distance_ly: f64,
    pub rarest_species: Option<String>,
    pub rarest_species_value: u64,
    pub longest_trip_ly: f64,
    pub most_valuable_trip: u64,
}

impl LifetimeStats {
    pub fn add_system(&mut self) {
        self.total_systems += 1;
    }

    pub fn add_body_scan(&mut self) {
        self.total_bodies_scanned += 1;
    }

    pub fn add_body_map(&mut self) {
        self.total_bodies_mapped += 1;
    }

    pub fn add_bio_species(&mut self, name: &str, value: u64) {
        self.total_bio_species += 1;
        self.total_bio_earned += value;
        if value > self.rarest_species_value {
            self.rarest_species = Some(name.to_string());
            self.rarest_species_value = value;
        }
    }

    pub fn add_distance(&mut self, ly: f64) {
        self.total_distance_ly += ly;
    }

    pub fn add_carto_earned(&mut self, value: u64) {
        self.total_carto_earned += value;
    }

    pub fn end_trip(&mut self, trip_value: u64, trip_distance: f64) {
        if trip_value > self.most_valuable_trip {
            self.most_valuable_trip = trip_value;
        }
        if trip_distance > self.longest_trip_ly {
            self.longest_trip_ly = trip_distance;
        }
    }
}
