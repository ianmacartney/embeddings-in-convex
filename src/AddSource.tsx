import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { useForm, Controller } from "react-hook-form";
import { Alert, Input, Textarea, Button } from "@rewind-ui/core";
import { api } from "../convex/_generated/api";

export function AddSource() {
  const createSource = useAction(api.sources.add);
  const [added, setAdded] = useState("");

  const { formState, handleSubmit, control, reset } = useForm<{
    name: string;
    text: string;
  }>({});
  const onSubmit = handleSubmit(({ name, text }) => {
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
    });
    textSplitter.createDocuments([text]).then((docs) => {
      createSource({
        name,
        chunks: docs.map((doc) => ({
          text: doc.pageContent,
          lines: doc.metadata.loc.lines,
        })),
      });
      setAdded(name);
      setTimeout(
        () => setAdded((state) => (state === name ? "" : state)),
        1000
      );
    });
  });
  useEffect(() => {
    if (formState.isSubmitSuccessful) {
      reset();
    }
  }, [formState, reset]);

  return (
    <form onSubmit={onSubmit}>
      {added.length ? (
        <Alert color="green">Successfully added {added}</Alert>
      ) : null}
      <Controller
        name="name"
        control={control}
        rules={{ required: true }}
        render={({ field }) => <Input placeholder="Name" {...field} />}
        defaultValue=""
      />
      <Controller
        name="text"
        control={control}
        rules={{ required: true }}
        render={({ field }) => <Textarea placeholder="Text" {...field} />}
        defaultValue=""
      />
      <Button type="submit" color="green">
        Submit
      </Button>
    </form>
  );
}
