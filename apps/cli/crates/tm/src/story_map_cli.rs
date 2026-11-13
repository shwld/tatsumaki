use clap::{Args, Subcommand, ValueEnum};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use tabled::{Table, Tabled, settings::Style};

use crate::{
    CliError, EXIT_GENERAL, EXIT_INVALID_ARGUMENT,
    application::artifact_flow::{FlowError, TokenProvider},
    epic_cli::{EpicClient, print_json},
};

#[derive(Args, Debug)]
pub struct StoryMapCommand {
    /// Project ID; defaults to the one in the project file
    #[arg(long, global = true)]
    pub project: Option<String>,
    #[command(subcommand)]
    pub command: StoryMapSubcommand,
}

/// Positions are given as the element to place after (`--after <ID>`); omit it
/// to place at the start. IDs come from `tm --json story-map get`.
#[derive(Subcommand, Debug)]
pub enum StoryMapSubcommand {
    /// List the story maps of a project
    List {
        #[arg(long)]
        include_archived: bool,
    },
    /// Create a story map
    Create {
        #[arg(long)]
        title: String,
        #[arg(long)]
        goal: Option<String>,
    },
    /// Show the whole structure of a map with the IDs of every element
    Get { map_id: String },
    /// Change the title or the achievement goal. Only the given fields change
    Update {
        map_id: String,
        #[arg(long)]
        title: Option<String>,
        #[arg(long)]
        goal: Option<String>,
    },
    /// Archive a map. Archived maps reject edits until restored
    Archive { map_id: String },
    /// Restore an archived map
    Restore { map_id: String },
    /// Edit the activities (the top row of the map)
    Activity {
        #[command(subcommand)]
        command: ActivityCommand,
    },
    /// Edit the tasks under an activity
    Task {
        #[command(subcommand)]
        command: TaskCommand,
    },
    /// Edit the slices (release rows)
    Slice {
        #[command(subcommand)]
        command: SliceCommand,
    },
    /// Edit the cards under a task, and link them to stories
    Card {
        #[command(subcommand)]
        command: CardCommand,
    },
}

#[derive(Subcommand, Debug)]
pub enum ActivityCommand {
    Add {
        map_id: String,
        #[arg(long)]
        title: String,
        #[arg(long)]
        after: Option<String>,
    },
    Rename {
        map_id: String,
        activity_id: String,
        #[arg(long)]
        title: String,
    },
    Move {
        map_id: String,
        activity_id: String,
        #[arg(long)]
        after: Option<String>,
    },
    /// Deletes the activity with its tasks and cards
    Delete { map_id: String, activity_id: String },
}

#[derive(Subcommand, Debug)]
pub enum TaskCommand {
    Add {
        map_id: String,
        #[arg(long)]
        activity: String,
        #[arg(long)]
        title: String,
        #[arg(long)]
        after: Option<String>,
    },
    Rename {
        map_id: String,
        task_id: String,
        #[arg(long)]
        title: String,
    },
    /// Move to another position or another activity
    Move {
        map_id: String,
        task_id: String,
        #[arg(long)]
        activity: String,
        #[arg(long)]
        after: Option<String>,
    },
    /// Deletes the task with its cards
    Delete { map_id: String, task_id: String },
}

#[derive(Subcommand, Debug)]
pub enum SliceCommand {
    Add {
        map_id: String,
        #[arg(long)]
        title: String,
        #[arg(long)]
        after: Option<String>,
    },
    Rename {
        map_id: String,
        slice_id: String,
        #[arg(long)]
        title: String,
    },
    Move {
        map_id: String,
        slice_id: String,
        #[arg(long)]
        after: Option<String>,
    },
    Delete {
        map_id: String,
        slice_id: String,
    },
}

#[derive(Copy, Clone, Debug, ValueEnum)]
pub enum StoryTypeArg {
    Feature,
    Bug,
    Chore,
}

impl StoryTypeArg {
    fn as_str(self) -> &'static str {
        match self {
            Self::Feature => "feature",
            Self::Bug => "bug",
            Self::Chore => "chore",
        }
    }
}

#[derive(Subcommand, Debug)]
pub enum CardCommand {
    /// Add a card. Without --slice it lands in the unplanned row
    Add {
        map_id: String,
        #[arg(long)]
        task: String,
        #[arg(long)]
        slice: Option<String>,
        #[arg(long)]
        after: Option<String>,
        #[arg(long)]
        idea_title: Option<String>,
        #[arg(long)]
        note: Option<String>,
        /// Story ID (not the number) to link the card to
        #[arg(long)]
        story: Option<String>,
    },
    /// Change the idea title or note. Only the given fields change
    Update {
        map_id: String,
        card_id: String,
        #[arg(long, conflicts_with = "clear_idea_title")]
        idea_title: Option<String>,
        #[arg(long)]
        clear_idea_title: bool,
        #[arg(long)]
        note: Option<String>,
    },
    /// Move to another task, slice or position. Without --slice it moves to the unplanned row
    Move {
        map_id: String,
        card_id: String,
        #[arg(long)]
        task: String,
        #[arg(long)]
        slice: Option<String>,
        #[arg(long)]
        after: Option<String>,
    },
    /// Link the card to a story, or unlink it with --clear
    SetStory {
        map_id: String,
        card_id: String,
        /// Story ID (not the number)
        #[arg(long, required_unless_present = "clear", conflicts_with = "clear")]
        story: Option<String>,
        #[arg(long)]
        clear: bool,
    },
    /// Create a story from the card and link it
    CreateStory {
        map_id: String,
        card_id: String,
        #[arg(long)]
        title: String,
        #[arg(long, default_value = "")]
        description: String,
        #[arg(long = "type", value_enum, default_value = "feature")]
        story_type: StoryTypeArg,
        #[arg(long)]
        icebox: bool,
    },
    Delete {
        map_id: String,
        card_id: String,
    },
}

fn opt(value: &Option<String>) -> Value {
    value.as_deref().map_or(Value::Null, Value::from)
}

fn insert_some(map: &mut Map<String, Value>, key: &str, value: &Option<String>) {
    if let Some(value) = value {
        map.insert(key.to_string(), Value::from(value.as_str()));
    }
}

/// The map to edit and the `storyMapCommandSchema` command to send, or `None`
/// for the commands that are not writes through the command endpoint.
pub fn command_for(command: &StoryMapSubcommand) -> Result<Option<(&str, Value)>, String> {
    use StoryMapSubcommand as S;
    Ok(Some(match command {
        S::List { .. } | S::Create { .. } | S::Get { .. } => return Ok(None),
        S::Update {
            map_id,
            title,
            goal,
        } => {
            let mut body = Map::new();
            body.insert("type".into(), "updateMap".into());
            insert_some(&mut body, "title", title);
            insert_some(&mut body, "achievementGoal", goal);
            if body.len() == 1 {
                return Err("nothing to update: pass --title or --goal".to_string());
            }
            (map_id, Value::Object(body))
        }
        S::Archive { map_id } => (map_id, json!({ "type": "updateMap", "archived": true })),
        S::Restore { map_id } => (map_id, json!({ "type": "updateMap", "archived": false })),
        S::Activity { command } => match command {
            ActivityCommand::Add {
                map_id,
                title,
                after,
            } => (
                map_id,
                json!({ "type": "addActivity", "title": title, "afterActivityId": opt(after) }),
            ),
            ActivityCommand::Rename {
                map_id,
                activity_id,
                title,
            } => (
                map_id,
                json!({ "type": "renameActivity", "activityId": activity_id, "title": title }),
            ),
            ActivityCommand::Move {
                map_id,
                activity_id,
                after,
            } => (
                map_id,
                json!({ "type": "moveActivity", "activityId": activity_id, "afterActivityId": opt(after) }),
            ),
            ActivityCommand::Delete {
                map_id,
                activity_id,
            } => (
                map_id,
                json!({ "type": "deleteActivity", "activityId": activity_id }),
            ),
        },
        S::Task { command } => match command {
            TaskCommand::Add {
                map_id,
                activity,
                title,
                after,
            } => (
                map_id,
                json!({ "type": "addTask", "activityId": activity, "title": title, "afterTaskId": opt(after) }),
            ),
            TaskCommand::Rename {
                map_id,
                task_id,
                title,
            } => (
                map_id,
                json!({ "type": "renameTask", "taskId": task_id, "title": title }),
            ),
            TaskCommand::Move {
                map_id,
                task_id,
                activity,
                after,
            } => (
                map_id,
                json!({ "type": "moveTask", "taskId": task_id, "activityId": activity, "afterTaskId": opt(after) }),
            ),
            TaskCommand::Delete { map_id, task_id } => {
                (map_id, json!({ "type": "deleteTask", "taskId": task_id }))
            }
        },
        S::Slice { command } => match command {
            SliceCommand::Add {
                map_id,
                title,
                after,
            } => (
                map_id,
                json!({ "type": "addSlice", "title": title, "afterSliceId": opt(after) }),
            ),
            SliceCommand::Rename {
                map_id,
                slice_id,
                title,
            } => (
                map_id,
                json!({ "type": "renameSlice", "sliceId": slice_id, "title": title }),
            ),
            SliceCommand::Move {
                map_id,
                slice_id,
                after,
            } => (
                map_id,
                json!({ "type": "moveSlice", "sliceId": slice_id, "afterSliceId": opt(after) }),
            ),
            SliceCommand::Delete { map_id, slice_id } => (
                map_id,
                json!({ "type": "deleteSlice", "sliceId": slice_id }),
            ),
        },
        S::Card { command } => match command {
            CardCommand::Add {
                map_id,
                task,
                slice,
                after,
                idea_title,
                note,
                story,
            } => {
                let mut body = Map::new();
                body.insert("type".into(), "addCard".into());
                body.insert("taskId".into(), task.as_str().into());
                body.insert("sliceId".into(), opt(slice));
                body.insert("afterCardId".into(), opt(after));
                insert_some(&mut body, "ideaTitle", idea_title);
                insert_some(&mut body, "note", note);
                insert_some(&mut body, "storyId", story);
                (map_id, Value::Object(body))
            }
            CardCommand::Update {
                map_id,
                card_id,
                idea_title,
                clear_idea_title,
                note,
            } => {
                let mut body = Map::new();
                body.insert("type".into(), "updateCard".into());
                body.insert("cardId".into(), card_id.as_str().into());
                insert_some(&mut body, "ideaTitle", idea_title);
                if *clear_idea_title {
                    body.insert("ideaTitle".into(), Value::Null);
                }
                insert_some(&mut body, "note", note);
                if body.len() == 2 {
                    return Err(
                        "nothing to update: pass --idea-title/--clear-idea-title or --note"
                            .to_string(),
                    );
                }
                (map_id, Value::Object(body))
            }
            CardCommand::Move {
                map_id,
                card_id,
                task,
                slice,
                after,
            } => (
                map_id,
                json!({
                    "type": "moveCard",
                    "cardId": card_id,
                    "taskId": task,
                    "sliceId": opt(slice),
                    "afterCardId": opt(after),
                }),
            ),
            CardCommand::SetStory {
                map_id,
                card_id,
                story,
                ..
            } => (
                map_id,
                json!({ "type": "setCardStory", "cardId": card_id, "storyId": opt(story) }),
            ),
            CardCommand::CreateStory {
                map_id,
                card_id,
                title,
                description,
                story_type,
                icebox,
            } => (
                map_id,
                json!({
                    "type": "createStoryFromCard",
                    "cardId": card_id,
                    "title": title,
                    "description": description,
                    "storyType": story_type.as_str(),
                    "isIcebox": icebox,
                }),
            ),
            CardCommand::Delete { map_id, card_id } => {
                (map_id, json!({ "type": "deleteCard", "cardId": card_id }))
            }
        },
    }))
}

/// A ULID, which the server requires as the operation ID. Sending the same one
/// again is answered with the first result instead of applying twice.
fn new_op_id() -> String {
    const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    let random: u128 = rand::random::<u128>() & ((1u128 << 80) - 1);
    let mut value = (millis << 80) | random;
    let mut out = [0u8; 26];
    for slot in out.iter_mut().rev() {
        *slot = ALPHABET[(value & 31) as usize];
        value >>= 5;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[derive(Deserialize)]
struct MapsBody {
    #[serde(rename = "storyMaps")]
    story_maps: Vec<Value>,
}

#[derive(Deserialize)]
struct MapBody {
    #[serde(rename = "storyMap")]
    story_map: Value,
}

#[derive(Deserialize)]
struct StructureBody {
    structure: Value,
}

fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}

fn by_position(items: &Value) -> Vec<&Value> {
    let mut list: Vec<&Value> = items
        .as_array()
        .map(|a| a.iter().collect())
        .unwrap_or_default();
    list.sort_by(|a, b| {
        let pa = a.get("position").and_then(Value::as_f64).unwrap_or(0.0);
        let pb = b.get("position").and_then(Value::as_f64).unwrap_or(0.0);
        pa.partial_cmp(&pb).unwrap_or(std::cmp::Ordering::Equal)
    });
    list
}

fn print_structure(structure: &Value) {
    let map = &structure["map"];
    let archived = if map["archivedAt"].is_null() {
        ""
    } else {
        " [archived]"
    };
    println!(
        "map: {} ({}){archived}",
        text(map, "title"),
        text(map, "id")
    );
    println!("goal: {}", text(map, "achievementGoal"));
    println!("slices:");
    for slice in by_position(&structure["slices"]) {
        println!("  {} {}", text(slice, "id"), text(slice, "title"));
    }
    let cards = by_position(&structure["cards"]);
    for activity in by_position(&structure["activities"]) {
        println!(
            "activity {} {}",
            text(activity, "id"),
            text(activity, "title")
        );
        for task in by_position(&structure["tasks"]) {
            if text(task, "activityId") != text(activity, "id") {
                continue;
            }
            println!("  task {} {}", text(task, "id"), text(task, "title"));
            for card in cards
                .iter()
                .filter(|c| text(c, "taskId") == text(task, "id"))
            {
                let label = match card.get("story").filter(|s| !s.is_null()) {
                    Some(story) => format!("#{} {}", story["number"], text(story, "title")),
                    None => text(card, "ideaTitle").to_string(),
                };
                let slice = card
                    .get("sliceId")
                    .and_then(Value::as_str)
                    .unwrap_or("unplanned");
                println!(
                    "    card {} [{}] slice={} {}",
                    text(card, "id"),
                    text(card, "storyState"),
                    slice,
                    label
                );
            }
        }
    }
}

#[derive(Tabled)]
struct MapRow {
    id: String,
    title: String,
    archived: String,
}

fn map_row(map: &Value) -> MapRow {
    MapRow {
        id: text(map, "id").to_string(),
        title: text(map, "title").to_string(),
        archived: if map["archivedAt"].is_null() {
            "-"
        } else {
            "yes"
        }
        .to_string(),
    }
}

pub async fn run_story_map<T: TokenProvider + Sync>(
    command: StoryMapCommand,
    base_url: &str,
    tokens: &T,
    json: bool,
) -> Result<(), FlowError> {
    let client = EpicClient {
        base_url,
        project: crate::infrastructure::project_file::require_project(command.project)?,
        tokens,
        client: reqwest::Client::new(),
    };
    let invalid = |m: String| (CliError::Message(m), EXIT_INVALID_ARGUMENT);
    let command = command.command;

    match &command {
        StoryMapSubcommand::List { include_archived } => {
            let path = if *include_archived {
                "/story-maps?includeArchived=true"
            } else {
                "/story-maps"
            };
            let body: MapsBody = client
                .send(reqwest::Method::GET, client.url(path), None)
                .await?;
            if json {
                return print_json(&body.story_maps);
            }
            let rows: Vec<MapRow> = body.story_maps.iter().map(map_row).collect();
            println!("{}", Table::new(rows).with(Style::sharp()));
            return Ok(());
        }
        StoryMapSubcommand::Create { title, goal } => {
            let mut payload = Map::new();
            payload.insert("title".into(), title.as_str().into());
            insert_some(&mut payload, "achievementGoal", goal);
            let body: MapBody = client
                .send(
                    reqwest::Method::POST,
                    client.url("/story-maps"),
                    Some(&Value::Object(payload)),
                )
                .await?;
            if json {
                return print_json(&body.story_map);
            }
            println!(
                "created story map: {} ({})",
                text(&body.story_map, "title"),
                text(&body.story_map, "id")
            );
            return Ok(());
        }
        StoryMapSubcommand::Get { map_id } => {
            let body: StructureBody = client
                .send(
                    reqwest::Method::GET,
                    client.url(&format!("/story-maps/{}", urlencoding::encode(map_id))),
                    None,
                )
                .await?;
            if json {
                return print_json(&body.structure);
            }
            print_structure(&body.structure);
            return Ok(());
        }
        _ => {}
    }

    let Some((map_id, command)) = command_for(&command).map_err(invalid)? else {
        return Err((
            CliError::Message("not a write command".into()),
            EXIT_GENERAL,
        ));
    };
    let payload = json!({ "opId": new_op_id(), "command": command });
    let outcome: Value = client
        .send(
            reqwest::Method::POST,
            client.url(&format!(
                "/story-maps/{}/commands",
                urlencoding::encode(map_id)
            )),
            Some(&payload),
        )
        .await?;
    if json {
        return print_json(&outcome);
    }
    match outcome.get("result").filter(|r| !r.is_null()) {
        Some(result) => println!("ok (seq {}): {result}", outcome["seq"]),
        None => println!("ok (seq {})", outcome["seq"]),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use clap::Parser;

    use super::*;

    #[derive(Parser)]
    struct Harness {
        #[command(flatten)]
        inner: StoryMapCommand,
    }

    fn parse(args: &[&str]) -> Result<StoryMapSubcommand, clap::Error> {
        Harness::try_parse_from(std::iter::once("tm").chain(args.iter().copied()))
            .map(|h| h.inner.command)
    }

    fn body(args: &[&str]) -> (String, Value) {
        let command = parse(args).unwrap();
        let (map, body) = command_for(&command).unwrap().unwrap();
        (map.to_string(), body)
    }

    #[test]
    fn op_id_is_a_ulid() {
        let id = new_op_id();
        assert_eq!(id.len(), 26);
        assert!(
            id.bytes()
                .all(|b| b"0123456789ABCDEFGHJKMNPQRSTVWXYZ".contains(&b))
        );
        assert_ne!(id, new_op_id());
    }

    #[test]
    fn archive_and_restore_toggle_the_archived_flag() {
        assert_eq!(
            body(&["archive", "m1"]),
            (
                "m1".into(),
                json!({ "type": "updateMap", "archived": true })
            )
        );
        assert_eq!(
            body(&["restore", "m1"]).1,
            json!({ "type": "updateMap", "archived": false })
        );
    }

    #[test]
    fn update_sends_only_given_fields_and_needs_one() {
        assert_eq!(
            body(&["update", "m1", "--goal", "G"]).1,
            json!({ "type": "updateMap", "achievementGoal": "G" })
        );
        let empty = parse(&["update", "m1"]).unwrap();
        assert!(command_for(&empty).is_err());
    }

    #[test]
    fn position_defaults_to_the_start() {
        assert_eq!(
            body(&["activity", "add", "m1", "--title", "A"]).1,
            json!({ "type": "addActivity", "title": "A", "afterActivityId": null })
        );
        assert_eq!(
            body(&[
                "task",
                "add",
                "m1",
                "--activity",
                "a1",
                "--title",
                "T",
                "--after",
                "t0"
            ])
            .1,
            json!({ "type": "addTask", "activityId": "a1", "title": "T", "afterTaskId": "t0" })
        );
    }

    #[test]
    fn card_without_slice_is_unplanned() {
        assert_eq!(
            body(&["card", "move", "m1", "c1", "--task", "t1"]).1,
            json!({
                "type": "moveCard",
                "cardId": "c1",
                "taskId": "t1",
                "sliceId": null,
                "afterCardId": null,
            })
        );
        assert_eq!(
            body(&["card", "add", "m1", "--task", "t1", "--idea-title", "I"]).1,
            json!({
                "type": "addCard",
                "taskId": "t1",
                "sliceId": null,
                "afterCardId": null,
                "ideaTitle": "I",
            })
        );
    }

    #[test]
    fn card_update_clears_the_idea_title_and_needs_a_field() {
        assert_eq!(
            body(&["card", "update", "m1", "c1", "--clear-idea-title"]).1,
            json!({ "type": "updateCard", "cardId": "c1", "ideaTitle": null })
        );
        let empty = parse(&["card", "update", "m1", "c1"]).unwrap();
        assert!(command_for(&empty).is_err());
    }

    #[test]
    fn set_story_links_or_unlinks() {
        assert_eq!(
            body(&["card", "set-story", "m1", "c1", "--story", "s1"]).1,
            json!({ "type": "setCardStory", "cardId": "c1", "storyId": "s1" })
        );
        assert_eq!(
            body(&["card", "set-story", "m1", "c1", "--clear"]).1,
            json!({ "type": "setCardStory", "cardId": "c1", "storyId": null })
        );
        assert!(parse(&["card", "set-story", "m1", "c1"]).is_err());
    }

    #[test]
    fn create_story_from_card_defaults_to_a_feature_outside_the_icebox() {
        assert_eq!(
            body(&["card", "create-story", "m1", "c1", "--title", "T"]).1,
            json!({
                "type": "createStoryFromCard",
                "cardId": "c1",
                "title": "T",
                "description": "",
                "storyType": "feature",
                "isIcebox": false,
            })
        );
    }

    #[test]
    fn reads_are_not_commands() {
        assert!(command_for(&parse(&["list"]).unwrap()).unwrap().is_none());
        assert!(
            command_for(&parse(&["get", "m1"]).unwrap())
                .unwrap()
                .is_none()
        );
    }
}
